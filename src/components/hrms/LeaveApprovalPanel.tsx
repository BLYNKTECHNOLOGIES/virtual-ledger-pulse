import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle, XCircle } from "lucide-react";
import { sendLeaveEmail } from "@/utils/leaveEmail";
import { invalidateAttendanceCaches } from "@/lib/hrms/attendanceCache";

/**
 * Inline leave approve/reject panel.
 * Used by the unified HRMS Requests inbox so HR never has to leave the inbox —
 * it writes to hr_leave_requests exactly like the dedicated Leave Requests page
 * (HR assigns the leave type at approval; the DB cascade consumes assigned type
 * -> comp-off -> casual -> LOP).
 */
export function LeaveApprovalPanel({ request, onDone }: { request: any; onDone?: () => void }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"idle" | "approve" | "reject">("idle");
  const [leaveTypeId, setLeaveTypeId] = useState<string>(request?.leave_type_id || "");
  const [rejectReason, setRejectReason] = useState("");

  const { data: leaveTypes = [] } = useQuery({
    queryKey: ["hr_leave_types"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("hr_leave_types").select("id, name").eq("is_active", true);
      return data || [];
    },
  });

  const actionable = ["requested", "pending", "manager_approved"].includes(String(request?.status));

  const decide = useMutation({
    mutationFn: async (status: "approved" | "rejected") => {
      if (status === "approved" && !leaveTypeId && !request?.leave_type_id) {
        throw new Error("Select a leave type before approving");
      }
      if (status === "rejected" && !rejectReason.trim()) {
        throw new Error("A rejection reason is required");
      }

      const { error } = await (supabase as any)
        .from("hr_leave_requests")
        .update({
          status,
          ...(status === "approved"
            ? {
                leave_type_id: leaveTypeId || request.leave_type_id,
                approved_at: new Date().toISOString(),
                hr_approved_at: new Date().toISOString(),
              }
            : { rejection_reason: rejectReason.trim() }),
        })
        .eq("id", request.id);
      if (error) throw error;

      const res = await sendLeaveEmail({
        eventType: status === "approved" ? "leave_approved" : "leave_rejected",
        requestId: request.id,
        employeeName:
          `${request.hr_employees?.first_name || ""} ${request.hr_employees?.last_name || ""}`.trim() || "Employee",
        leaveType:
          (leaveTypes as any[]).find((lt: any) => lt.id === (leaveTypeId || request.leave_type_id))?.name ||
          request.hr_leave_types?.name,
        startDate: request.start_date,
        endDate: request.end_date,
        totalDays: request.total_days,
        reason: request.reason,
        decidedBy: "HR",
        employeeEmail: request.hr_employees?.email || null,
      });
      return { emailFailures: res?.failures || [], noEmail: !request.hr_employees?.email, status };
    },
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["hrms_unified_requests"] });
      qc.invalidateQueries({ queryKey: ["hr_leave_requests"] });
      qc.invalidateQueries({ queryKey: ["hr_leave_allocations_all"] });
      invalidateAttendanceCaches(qc);
      toast.success(res.status === "approved" ? "Leave approved" : "Leave rejected");
      if (res?.noEmail) toast.warning("No email on record for this employee — notification not sent");
      else if (res?.emailFailures?.length) toast.warning(`Email not delivered: ${res.emailFailures[0]}`);
      setMode("idle");
      setRejectReason("");
      onDone?.();
    },
    onError: (e: any) => toast.error(e?.message || "Could not update the leave request"),
  });

  if (!actionable) {
    return (
      <p className="text-xs text-muted-foreground">
        This leave request is already {String(request?.status).replace(/_/g, " ")} — no further action needed.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {mode === "idle" && (
        <div className="flex flex-col sm:flex-row gap-2">
          <Button className="flex-1 h-10" onClick={() => setMode("approve")}>
            <CheckCircle className="h-4 w-4 mr-2" /> Approve
          </Button>
          <Button variant="outline" className="flex-1 h-10 text-destructive" onClick={() => setMode("reject")}>
            <XCircle className="h-4 w-4 mr-2" /> Reject
          </Button>
        </div>
      )}

      {mode === "approve" && (
        <div className="space-y-2">
          <Label>Leave type *</Label>
          <Select value={leaveTypeId} onValueChange={setLeaveTypeId}>
            <SelectTrigger className="h-10"><SelectValue placeholder="Assign a leave type" /></SelectTrigger>
            <SelectContent>
              {(leaveTypes as any[]).map((lt: any) => (
                <SelectItem key={lt.id} value={lt.id}>{lt.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            Balance cascade runs automatically: assigned type → comp-off → casual → LOP.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 h-10" onClick={() => setMode("idle")}>Back</Button>
            <Button
              className="flex-1 h-10"
              disabled={decide.isPending || !leaveTypeId}
              onClick={() => decide.mutate("approved")}
            >
              Confirm approval
            </Button>
          </div>
        </div>
      )}

      {mode === "reject" && (
        <div className="space-y-2">
          <Label>Rejection reason *</Label>
          <Textarea rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Why is this leave being rejected — shared with the employee." />
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 h-10" onClick={() => setMode("idle")}>Back</Button>
            <Button
              variant="destructive"
              className="flex-1 h-10"
              disabled={decide.isPending || !rejectReason.trim()}
              onClick={() => decide.mutate("rejected")}
            >
              Confirm rejection
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
