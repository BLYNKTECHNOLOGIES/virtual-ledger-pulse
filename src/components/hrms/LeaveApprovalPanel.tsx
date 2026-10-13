import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle, XCircle } from "lucide-react";
import { useLeaveDecision, LEAVE_APPROVE_BALANCE_NOTE } from "@/components/hrms/leave/LeaveDecision";

/**
 * Inline leave approve/reject panel.
 * Used by the unified HRMS Requests inbox so HR never has to leave the inbox —
 * it writes to hr_leave_requests exactly like the dedicated Leave Requests page
 * (HR assigns the leave type at approval; approval never spills into other
 * types — the DB refuses with "Not enough … balance").
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

  // Shared decision logic (same writes, email and cache refresh as the Leave
  // Requests page). This panel's stage rule is unchanged for now.
  const shared = useLeaveDecision({
    onDone: () => {
      qc.invalidateQueries({ queryKey: ["hrms_unified_requests"] });
      setMode("idle");
      setRejectReason("");
      onDone?.();
    },
  });
  const decide = {
    isPending: shared.isPending,
    mutate: (status: "approved" | "rejected") =>
      shared.mutate({
        request,
        status,
        leaveTypeId: status === "approved" ? leaveTypeId || request.leave_type_id : undefined,
        leaveTypeName: (leaveTypes as any[]).find((lt: any) => lt.id === (leaveTypeId || request.leave_type_id))?.name,
        rejectionReason: status === "rejected" ? rejectReason : undefined,
      }),
  };

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
            {LEAVE_APPROVE_BALANCE_NOTE}
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
