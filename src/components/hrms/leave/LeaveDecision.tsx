import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveDialog } from "@/components/horilla/primitives/ResponsiveDialog";
import { sendLeaveEmail } from "@/utils/leaveEmail";
import { invalidateAttendanceCaches } from "@/lib/hrms/attendanceCache";
import { safeFormat } from "@/lib/safe-date";

/**
 * Shared HR leave decision logic (Leave Requests page is the approval owner;
 * the employee profile Leave tab and the Requests inbox reuse it). Balances are
 * handled by DB triggers — never add balance maths here.
 */

/** Approval never spills into other leave types — the DB refuses instead. */
export const LEAVE_APPROVE_BALANCE_NOTE =
  "The leave is charged only to the type chosen here. If that type doesn't have enough balance, approval is refused with \"Not enough … balance\" — nothing is drawn from other leave types.";

export type LeaveDecisionStatus = "approved" | "rejected" | "cancelled";

export interface LeaveDecisionArgs {
  request: any;
  status: LeaveDecisionStatus;
  leaveTypeId?: string;
  leaveTypeName?: string;
  rejectionReason?: string;
}

async function resolveEmployee(request: any): Promise<{ name: string; email: string | null }> {
  const e = request?.hr_employees;
  if (e && (e.first_name || e.email)) {
    return { name: `${e.first_name || ""} ${e.last_name || ""}`.trim() || "Employee", email: e.email || null };
  }
  const { data } = await (supabase as any)
    .from("hr_employees").select("first_name, last_name, email").eq("id", request.employee_id).maybeSingle();
  return { name: `${data?.first_name || ""} ${data?.last_name || ""}`.trim() || "Employee", email: data?.email || null };
}

export function invalidateLeaveDecisionCaches(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["hr_leave_requests"] });
  qc.invalidateQueries({ queryKey: ["hr_leave_allocations"] });
  qc.invalidateQueries({ queryKey: ["hr_leave_allocations_all"] });
  invalidateAttendanceCaches(qc);
}

export function useLeaveDecision(opts?: { onDone?: (status: LeaveDecisionStatus) => void }) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ request, status, leaveTypeId, leaveTypeName, rejectionReason }: LeaveDecisionArgs) => {
      const typeId = leaveTypeId || request?.leave_type_id;
      if (status === "approved" && !typeId) throw new Error("Select a leave type before approving");
      const reason = (rejectionReason || "").trim();
      if (status === "rejected" && !reason) throw new Error("A rejection reason is required");

      const now = new Date().toISOString();
      const { error } = await (supabase as any).from("hr_leave_requests").update({
        status,
        ...(status === "approved" ? { leave_type_id: typeId, approved_at: now, hr_approved_at: now } : {}),
        ...(status === "rejected" ? { rejection_reason: reason } : {}),
      }).eq("id", request.id);
      if (error) throw error;

      if (status === "cancelled") return { status, email: null as null | (() => Promise<{ failures: string[]; noEmail: boolean }>) };

      // The decision is saved at this point. The email (SMTP, several seconds) is sent
      // after the dialog closes, so HR is never kept waiting on mail delivery.
      const email = async () => {
      const emp = await resolveEmployee(request);
      const res = await sendLeaveEmail({
        eventType: status === "approved" ? "leave_approved" : "leave_rejected",
        requestId: request.id,
        employeeName: emp.name,
        leaveType: leaveTypeName || request.hr_leave_types?.name,
        startDate: request.start_date,
        endDate: request.end_date,
        totalDays: request.total_days,
        reason: request.reason,
        rejectionReason: status === "rejected" ? reason : undefined,
        decidedBy: "HR",
        employeeEmail: emp.email,
      });
      return { failures: res?.failures || [], noEmail: !emp.email };
      };
      return { status, email };
    },
    onSuccess: (res) => {
      invalidateLeaveDecisionCaches(qc);
      toast.success(res.status === "approved" ? "Leave approved" : res.status === "rejected" ? "Leave rejected" : "Leave cancelled");
      opts?.onDone?.(res.status);
      res.email?.().then((r) => {
        if (r.noEmail) toast.warning("No email on record for this employee — notification not sent");
        else if (r.failures.length) toast.warning(`Email not delivered: ${r.failures[0]}`);
      }).catch((e) => toast.warning(`Email not delivered: ${e?.message || e}`));
    },
    onError: (e: any) => toast.error(e?.message || "Failed to update leave request"),
  });
}

function RequestSummary({ request, employeeName }: { request: any; employeeName?: string }) {
  const name = employeeName || `${request?.hr_employees?.first_name || ""} ${request?.hr_employees?.last_name || ""}`.trim();
  return (
    <div className="rounded-md border bg-muted/40 p-3 space-y-1 text-sm">
      {name && <p className="font-medium">{name}</p>}
      <p className="tabular-nums">
        {safeFormat(request.start_date, "EEE dd MMM")} → {safeFormat(request.end_date, "EEE dd MMM yyyy")} · {request.total_days} {Number(request.total_days) === 1 ? "day" : "days"}
        {request.is_half_day ? ` · half day (${request.half_day_period || "—"})` : ""}
      </p>
      {request.reason && <p className="text-xs text-muted-foreground">Employee's reason: {request.reason}</p>}
    </div>
  );
}

export function ApproveLeaveDialog({
  request, onClose, leaveTypes, decision, employeeName,
}: { request: any | null; onClose: () => void; leaveTypes: any[]; decision: ReturnType<typeof useLeaveDecision>; employeeName?: string }) {
  const [typeId, setTypeId] = useState("");
  useEffect(() => { setTypeId(request?.leave_type_id || ""); }, [request]);
  return (
    <ResponsiveDialog
      open={!!request}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={<span className="text-sm font-semibold flex items-center gap-2"><CheckCircle className="h-4 w-4 text-success" /> Approve Leave</span>}
      footer={
        <>
          <Button variant="outline" className="h-9" onClick={onClose}>Cancel</Button>
          <Button
            className="h-9"
            disabled={!typeId || decision.isPending}
            onClick={() => decision.mutate({
              request, status: "approved", leaveTypeId: typeId,
              leaveTypeName: leaveTypes.find((lt: any) => lt.id === typeId)?.name,
            })}
          >
            Approve
          </Button>
        </>
      }
    >
      {request && (
        <div className="space-y-4">
          <RequestSummary request={request} employeeName={employeeName} />
          <div>
            <Label>Leave Type (assigned by HR)</Label>
            <Select value={typeId} onValueChange={setTypeId}>
              <SelectTrigger className="h-9 text-foreground"><SelectValue placeholder="Select leave type" /></SelectTrigger>
              <SelectContent>{leaveTypes.map((lt: any) => <SelectItem key={lt.id} value={lt.id}>{lt.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <p className="text-[11px] text-muted-foreground">{LEAVE_APPROVE_BALANCE_NOTE}</p>
        </div>
      )}
    </ResponsiveDialog>
  );
}

export function RejectLeaveDialog({
  request, onClose, decision, employeeName,
}: { request: any | null; onClose: () => void; decision: ReturnType<typeof useLeaveDecision>; employeeName?: string }) {
  const [reason, setReason] = useState("");
  useEffect(() => { setReason(""); }, [request]);
  return (
    <ResponsiveDialog
      open={!!request}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={<span className="text-sm font-semibold flex items-center gap-2"><XCircle className="h-4 w-4 text-destructive" /> Reject Leave</span>}
      footer={
        <>
          <Button variant="outline" className="h-9" onClick={onClose}>Back</Button>
          <Button
            variant="destructive"
            className="h-9"
            disabled={!reason.trim() || decision.isPending}
            onClick={() => decision.mutate({ request, status: "rejected", rejectionReason: reason })}
          >
            Reject leave
          </Button>
        </>
      }
    >
      {request && (
        <div className="space-y-3">
          <RequestSummary request={request} employeeName={employeeName} />
          <div className="space-y-1">
            <Label>Reason for rejection *</Label>
            <Textarea rows={3} className="text-foreground" value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="Shared with the employee in My Requests and the rejection email." />
          </div>
        </div>
      )}
    </ResponsiveDialog>
  );
}
