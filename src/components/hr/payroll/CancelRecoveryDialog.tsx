import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export type CancelTarget = {
  kind: "loan" | "deposit" | "ctc_revision";
  refId: string;
  title: string; // e.g. "Himanshu Rajak — Recovery ₹100"
};

/** Permanently cancels an automatic recovery so no job re-creates it. */
export function CancelRecoveryDialog({ target, onClose }: { target: CancelTarget | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [scope, setScope] = useState<"this" | "all_future">("this");
  const isInstallment = target?.kind === "loan" || target?.kind === "deposit";

  const m = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("hr_cancel_recovery", {
        p_kind: target!.kind, p_ref: target!.refId,
        p_scope: isInstallment ? scope : "all_future", p_reason: reason,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (d: any) => {
      toast.success(
        d?.cancelled_installments
          ? `Cancelled ${d.cancelled_installments} instalment(s) — they won't be deducted again`
          : "Cancelled permanently — it won't be staged again",
      );
      ["payroll_auto_recoveries", "payroll_auto_recovery_staged", "payroll_inputs", "training_ctc_adjustments"]
        .forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      setReason(""); setScope("this"); onClose();
    },
    onError: (e: any) => toast.error(e.message || "Could not cancel"),
  });

  return (
    <AlertDialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel recovery</AlertDialogTitle>
          <AlertDialogDescription>
            {target?.title}. Anything already sent to RazorpayX is not affected.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {isInstallment && (
          <RadioGroup value={scope} onValueChange={(v) => setScope(v as any)} className="space-y-1">
            <div className="flex items-center gap-2"><RadioGroupItem value="this" id="cr-this" /><Label htmlFor="cr-this">Only this instalment</Label></div>
            <div className="flex items-center gap-2"><RadioGroupItem value="all_future" id="cr-all" /><Label htmlFor="cr-all">This and all later instalments</Label></div>
          </RadioGroup>
        )}
        <Textarea className="text-foreground" placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <AlertDialogFooter>
          <AlertDialogCancel>Keep</AlertDialogCancel>
          <Button variant="destructive" disabled={!reason.trim() || m.isPending} onClick={() => m.mutate()}>
            {m.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}Cancel recovery
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
