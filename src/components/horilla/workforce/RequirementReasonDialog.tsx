import { useEffect, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRequirementTransition, type RequirementAction } from "@/hooks/hrms/useWorkforcePlanning";

export interface ReasonTarget {
  id: string; requirement_no: string; action: Extract<RequirementAction, "reject" | "cancel">;
  /** What happens to the line afterwards, shown before confirming. */
  consequence?: string | null;
}

/** What declining/cancelling does to the line's automatic hiring (mirrors hr_requirement_transition + reconcile). */
export function declineConsequence(
  r: { source?: string | null; status?: string | null; number_required?: number | null; positions_filled?: number | null; adds_headcount?: number | null },
  lineShortAfter: number | null,
  /** The request's line, when known (for "adds headcount" requests: its required number). */
  line?: { required_hc: number; follow_desks?: boolean | null } | null,
): string | null {
  const adds = Number(r.adds_headcount) || 0;
  if (adds > 0) {
    // Approving raised the line by the added number; cancelling an approved one takes back the part not filled yet.
    if (!["approved", "recruitment_active", "partially_fulfilled"].includes(r.status ?? ""))
      return "Nothing changes on the line: its required number goes up only when a request that adds people is approved.";
    const back = Math.min(adds, Math.max(0, (r.number_required ?? 0) - (r.positions_filled ?? 0)));
    if (back === 0) return "Everyone it added has been filled, so the line's required number stays as it is.";
    if (line?.follow_desks) return "The line follows its desks, so its required number stays as it is.";
    return line
      ? `Cancelling takes back its ${back} unfilled: the line's required number goes from ${line.required_hc} to ${Math.max(0, line.required_hc - back)}.`
      : `Cancelling takes back its ${back} unfilled from the line's required number.`;
  }
  if (r.source === "employee_separation")
    return "The line's automatic request covers this desk instead: it is raised once the person has left (straight away if they already have).";
  if (r.source !== "capacity_occupancy") {
    return lineShortAfter && lineShortAfter > 0
      ? `The line is still short by ${lineShortAfter} — the system raises its own automatic request for it (awaiting approval).`
      : null;
  }
  if (r.status === "pending_approval") {
    const n = Math.max(0, (r.number_required ?? 0) - (r.positions_filled ?? 0));
    return `These ${n} are held back on the line: no automatic request is raised for them until the line changes or someone clicks "Raise again" on it.`;
  }
  if (lineShortAfter && lineShortAfter > 0)
    return `The line is still short by ${lineShortAfter} — a new automatic request for ${lineShortAfter} will be raised for approval.`;
  return null;
}

/** Reject or cancel a hiring request with the reason the database requires. */
export function RequirementReasonDialog({ target, onClose }: { target: ReasonTarget | null; onClose: () => void }) {
  const t = useRequirementTransition();
  const [reason, setReason] = useState("");
  useEffect(() => setReason(""), [target]);
  const verb = target?.action === "cancel" ? "Cancel" : "Reject";
  return (
    <AlertDialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{verb} {target?.requirement_no}?</AlertDialogTitle>
          <AlertDialogDescription>
            Give a reason. It is saved on the request and in the plan history.
            {target?.consequence ? <span className="mt-2 block text-foreground">{target.consequence}</span> : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Textarea rows={3} className="text-foreground" value={reason} onChange={(e) => setReason(e.target.value)} />
        <AlertDialogFooter>
          <AlertDialogCancel>Back</AlertDialogCancel>
          <AlertDialogAction
            disabled={!reason.trim() || t.isPending}
            onClick={(e) => {
              e.preventDefault();
              if (!target) return;
              t.mutate({ id: target.id, action: target.action, reason }, { onSuccess: onClose });
            }}
          >
            {t.isPending ? "Saving..." : verb}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
