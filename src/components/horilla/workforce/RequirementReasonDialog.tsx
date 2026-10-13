import { useEffect, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRequirementTransition, type RequirementAction } from "@/hooks/hrms/useWorkforcePlanning";

export interface ReasonTarget { id: string; requirement_no: string; action: Extract<RequirementAction, "reject" | "cancel"> }

/** Reject or cancel a requirement with the reason the database requires. */
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
          <AlertDialogDescription>Give a reason. It is saved on the requirement and in the plan history.</AlertDialogDescription>
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
