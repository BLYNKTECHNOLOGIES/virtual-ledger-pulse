import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle2, XCircle, AlertTriangle, UserCheck } from "lucide-react";
import { sendRegularizationEmail, regCategoryLabel } from "@/utils/regularizationEmail";
import { invalidateAttendanceCaches } from "@/lib/hrms/attendanceCache";

const REASON_CODES = [
  { value: "missed_punch", label: "Missed punch" },
  { value: "device_offline", label: "Device offline" },
  { value: "wrong_shift_mapped", label: "Wrong shift mapped" },
  { value: "stale_session_resolution", label: "Stale-session resolution" },
  { value: "approved_offsite", label: "Approved off-site work" },
  { value: "other_documented", label: "Other (documented)" },
];

const fmtTime = (ts: string | null) =>
  ts ? new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—";

/**
 * Inline attendance-regularization review panel (HR).
 * Mirrors the dedicated Regularization page exactly — raw-punch evidence
 * validation, reason codes, audited overrides, rejection reasons, push to
 * reporting manager — so approvals can be completed from the Requests inbox.
 */
export function RegularizationApprovalPanel({ request, onDone }: { request: any; onDone?: () => void }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"idle" | "approve" | "reject">("idle");
  const [reasonCode, setReasonCode] = useState("");
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState<any>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);

  const actionable = request?.status === "pending"
    || request?.status === "manager_review"
    || request?.status === "manager_reviewed";

  // Validate the proposal against raw punches as soon as HR opts to approve.
  useEffect(() => {
    if (mode !== "approve" || evidence || evidenceLoading) return;
    let cancelled = false;
    (async () => {
      setEvidenceLoading(true);
      try {
        const { data, error } = await (supabase as any).rpc("hr_validate_regularization_proposal", {
          _employee_id: request.employee_id,
          _date: request.attendance_date,
          _proposed_in: request.requested_check_in,
          _proposed_out: request.requested_check_out,
          _window_minutes: 10,
        });
        if (error) throw error;
        if (!cancelled) setEvidence(data);
      } catch (e: any) {
        if (!cancelled) toast.error(e?.message || "Could not validate against raw punches");
      } finally {
        if (!cancelled) setEvidenceLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["hrms_unified_requests"] });
    qc.invalidateQueries({ queryKey: ["reg_requests_hr"] });
    qc.invalidateQueries({ queryKey: ["intervention_log_recent"] });
    invalidateAttendanceCaches(qc);
  };

  const pushToManager = useMutation({
    mutationFn: async () => {
      const { data: wi } = await (supabase as any)
        .from("hr_employee_work_info")
        .select("reporting_manager_id")
        .eq("employee_id", request.employee_id)
        .maybeSingle();
      const managerId = wi?.reporting_manager_id;
      if (!managerId || managerId === request.employee_id) {
        throw new Error("No reporting manager is set for this employee — set one in the employee work info first.");
      }
      const { data: u } = await supabase.auth.getUser();
      const { error } = await (supabase as any)
        .from("hr_attendance_regularization_requests")
        .update({ status: "manager_review", manager_id: managerId, pushed_by: u?.user?.id ?? null })
        .eq("id", request.id);
      if (error) throw error;

      const { data: mgr } = await (supabase as any)
        .from("hr_employees").select("first_name, last_name, email").eq("id", managerId).maybeSingle();

      await (supabase as any).from("hr_attendance_intervention_log").insert({
        request_id: request.id,
        employee_id: request.employee_id,
        action: "regularization_pushed_to_manager",
        notes: `Forwarded to ${[mgr?.first_name, mgr?.last_name].filter(Boolean).join(" ") || "reporting manager"}`,
        actor_id: u?.user?.id ?? null,
        actor_email: u?.user?.email ?? null,
        payload: { manager_id: managerId, attendance_date: request.attendance_date },
      });

      sendRegularizationEmail({
        eventType: "reg_pushed_to_manager",
        requestId: request.id,
        employeeName: `${request.hr_employees?.first_name || ""} ${request.hr_employees?.last_name || ""}`.trim() || "Employee",
        attendanceDate: request.attendance_date,
        requestedIn: fmtTime(request.requested_check_in),
        requestedOut: fmtTime(request.requested_check_out),
        reasonCategory: regCategoryLabel(request.reason_category),
        reason: request.reason,
        managerEmail: mgr?.email || null,
        managerName: [mgr?.first_name, mgr?.last_name].filter(Boolean).join(" ") || null,
      });
    },
    onSuccess: () => {
      toast.success("Forwarded to the reporting manager");
      invalidate();
      onDone?.();
    },
    onError: (e: any) => toast.error(e?.message || "Could not forward the request"),
  });

  const review = useMutation({
    mutationFn: async (decision: "approved" | "rejected") => {
      if (decision === "approved" && !reasonCode) throw new Error("Pick a reason code before approving");
      const isOverride = decision === "approved" && evidence && !evidence.evidence_ok;
      if (isOverride && !note.trim()) {
        throw new Error("Unsupported edits require an override reason (this is audited).");
      }
      if (decision === "rejected" && !note.trim()) {
        throw new Error("A rejection reason is required (this is audited).");
      }
      const auditNote = note.trim()
        || (decision === "approved"
          ? (REASON_CODES.find((c) => c.value === reasonCode)?.label || "Approved")
          : "Rejected");
      const { data: u } = await supabase.auth.getUser();
      const nowIso = new Date().toISOString();
      const evidenceStatus = decision === "approved"
        ? (evidence?.evidence_ok ? "evidence_ok" : "unsupported_override")
        : null;

      const { error } = await (supabase as any)
        .from("hr_attendance_regularization_requests")
        .update({
          status: decision,
          reason_code: decision === "approved" ? reasonCode : null,
          approver_id: u?.user?.id,
          approver_notes: auditNote,
          approved_at: nowIso,
          evidence_status: evidenceStatus,
          evidence_payload: evidence ?? null,
          override_admin_id: isOverride ? u?.user?.id : null,
          override_reason: isOverride ? note.trim() : null,
        })
        .eq("id", request.id);
      if (error) throw error;

      await (supabase as any).from("hr_attendance_intervention_log").insert({
        request_id: request.id,
        employee_id: request.employee_id,
        action: decision === "approved"
          ? (isOverride ? "regularization_unsupported_override" : "regularization_approved")
          : "regularization_rejected",
        reason_code: decision === "approved" ? reasonCode : null,
        notes: auditNote,
        actor_id: u?.user?.id ?? null,
        actor_email: u?.user?.email ?? null,
        payload: {
          attendance_date: request.attendance_date,
          requested_check_in: request.requested_check_in,
          requested_check_out: request.requested_check_out,
          evidence_status: evidenceStatus,
          override_reason: isOverride ? note.trim() : null,
          matched_in_punch_id: evidence?.matched_in_punch_id ?? null,
          matched_out_punch_id: evidence?.matched_out_punch_id ?? null,
        },
      });

      sendRegularizationEmail({
        eventType: decision === "approved" ? "reg_approved" : "reg_rejected",
        requestId: request.id,
        employeeName: `${request.hr_employees?.first_name || ""} ${request.hr_employees?.last_name || ""}`.trim() || "Employee",
        attendanceDate: request.attendance_date,
        requestedIn: fmtTime(request.requested_check_in),
        requestedOut: fmtTime(request.requested_check_out),
        reasonCategory: regCategoryLabel(request.reason_category),
        reason: request.reason,
        managerRecommendation: request.manager_status
          ? (request.manager_status === "approved" ? "Approved" : "Rejected")
          : null,
        managerRemarks: request.manager_remarks || null,
        decidedBy: "HR",
        approverNotes: auditNote,
        employeeEmail: request.hr_employees?.email || null,
      });
      return decision;
    },
    onSuccess: (decision) => {
      toast.success(`Regularization ${decision}`);
      invalidate();
      setMode("idle"); setReasonCode(""); setNote(""); setEvidence(null);
      onDone?.();
    },
    onError: (e: any) =>
      toast.error(e?.message || "Failed", {
        description: /18 hours|after check-in/i.test(e?.message || "")
          ? "Ask the employee to resubmit with corrected times, or fix the times before approving."
          : undefined,
        duration: 10000,
      }),
  });

  if (!actionable) {
    return (
      <p className="text-xs text-muted-foreground">
        This request is already {String(request?.status).replace(/_/g, " ")} — no further action needed.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {mode === "idle" && (
        <div className="space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <Button className="flex-1 h-10" onClick={() => setMode("approve")}>
              <CheckCircle2 className="h-4 w-4 mr-2" /> Approve
            </Button>
            <Button variant="outline" className="flex-1 h-10 text-destructive" onClick={() => setMode("reject")}>
              <XCircle className="h-4 w-4 mr-2" /> Reject
            </Button>
          </div>
          {request.status === "pending" && (
            <Button variant="outline" className="w-full h-10" disabled={pushToManager.isPending}
              onClick={() => pushToManager.mutate()}>
              <UserCheck className="h-4 w-4 mr-2" /> Push to reporting manager
            </Button>
          )}
        </div>
      )}

      {mode === "approve" && (
        <div className="space-y-3">
          <div className="rounded border p-2 text-xs space-y-1">
            <div className="font-medium flex items-center gap-2">
              Raw-punch evidence
              {evidenceLoading && <span className="text-muted-foreground">checking…</span>}
            </div>
            {evidence ? (
              evidence.evidence_ok ? (
                <div className="text-success flex items-start gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 mt-0.5" />
                  <div>
                    Proposal is supported by raw punches within ±{evidence.window_minutes ?? 10} min.
                    {evidence.matched_in_punch_at && <div>Matched IN: {fmtTime(evidence.matched_in_punch_at)}</div>}
                    {evidence.matched_out_punch_at && <div>Matched OUT: {fmtTime(evidence.matched_out_punch_at)}</div>}
                  </div>
                </div>
              ) : (
                <div className="text-warning flex items-start gap-1">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5" />
                  <div>
                    No raw punches match this proposal. Approving records an <b>unsupported override</b> in the audit log.
                    {Array.isArray(evidence.nearby_punches) && evidence.nearby_punches.length > 0 && (
                      <div className="mt-1 text-muted-foreground">
                        Nearby: {evidence.nearby_punches.slice(0, 4).map((p: any) => fmtTime(p.punch_time)).join(", ")}
                      </div>
                    )}
                  </div>
                </div>
              )
            ) : !evidenceLoading ? (
              <div className="text-muted-foreground">Validator returned no evidence payload.</div>
            ) : null}
          </div>

          <div className="space-y-1">
            <Label>Reason code *</Label>
            <Select value={reasonCode} onValueChange={setReasonCode}>
              <SelectTrigger className="h-10"><SelectValue placeholder="Pick a reason code" /></SelectTrigger>
              <SelectContent>
                {REASON_CODES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {evidence && !evidence.evidence_ok && (
            <div className="space-y-1">
              <Label>Override reason * <span className="text-warning">(audited)</span></Label>
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="Why is HR approving without raw-punch support?" />
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 h-10" onClick={() => setMode("idle")}>Back</Button>
            <Button className="flex-1 h-10" disabled={review.isPending || !reasonCode}
              onClick={() => review.mutate("approved")}>
              Confirm approval
            </Button>
          </div>
        </div>
      )}

      {mode === "reject" && (
        <div className="space-y-2">
          <Label>Rejection reason *</Label>
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Why is this being rejected — stored in the audit log." />
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 h-10" onClick={() => setMode("idle")}>Back</Button>
            <Button variant="destructive" className="flex-1 h-10" disabled={review.isPending || !note.trim()}
              onClick={() => review.mutate("rejected")}>
              Confirm rejection
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
