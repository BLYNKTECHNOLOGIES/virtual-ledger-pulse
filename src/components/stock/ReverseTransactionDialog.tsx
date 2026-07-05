import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getCurrentUserId } from "@/lib/system-action-logger";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ReverseTransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The wallet transaction being reversed (needs id, amount/quantity, asset_code). */
  transaction: any | null;
  /** Optional extra work after a successful reversal (e.g. local refetch()). */
  onReversed?: () => void;
}

/**
 * Shared "Reverse Transaction" confirm dialog wrapping the immutable-ledger
 * `reverse_wallet_transaction` RPC. Payload is byte-identical to the former
 * per-tab copies in StockTransactionsTab and WalletManagementTab.
 */
export function ReverseTransactionDialog({
  open,
  onOpenChange,
  transaction,
  onReversed,
}: ReverseTransactionDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [reversalReason, setReversalReason] = useState("");

  useEffect(() => {
    if (open) setReversalReason("");
  }, [open, transaction?.id]);

  const deleteTransactionMutation = useMutation({
    mutationFn: async ({ transactionId, reason }: { transactionId: string; reason: string }) => {
      const rawUserId = getCurrentUserId();
      const isValidUuid = rawUserId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawUserId);
      const reversedBy = isValidUuid ? rawUserId : null;

      const { data, error } = await supabase.rpc("reverse_wallet_transaction", {
        p_tx_id: transactionId,
        p_reason: reason,
        p_reversed_by: reversedBy,
      });

      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      toast({
        title: "Transaction Reversed",
        description: "An opposite-sign reversal entry was posted. The original record is preserved.",
      });
      queryClient.invalidateQueries({ queryKey: ["wallet_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["wallet_transactions_live"] });
      queryClient.invalidateQueries({ queryKey: ["wallet_stock_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      queryClient.invalidateQueries({ queryKey: ["wallet_stock_summary"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      onReversed?.();
      onOpenChange(false);
      setReversalReason("");
    },
    onError: (error: any) => {
      toast({
        title: "Reversal failed",
        description: error?.message || "Failed to post reversal",
        variant: "destructive",
      });
    },
  });

  const confirmDeleteTransaction = () => {
    if (transaction && reversalReason.trim().length >= 3) {
      deleteTransactionMutation.mutate({
        transactionId: transaction.id,
        reason: reversalReason.trim(),
      });
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reverse Transaction</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                The original entry will be preserved forever. A new opposite-sign reversal row of{" "}
                <strong>
                  {(transaction?.amount ?? transaction?.quantity ?? 0).toLocaleString("en-IN")}{" "}
                  {transaction?.asset_code || "USDT"}
                </strong>{" "}
                will be posted and linked back to it.
              </p>
              <p className="text-muted-foreground">
                Provide a clear reason — it is recorded in the immutable audit chain.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="shared-reversal-reason">Reason (required, min 3 chars)</Label>
          <Textarea
            id="shared-reversal-reason"
            value={reversalReason}
            onChange={(e) => setReversalReason(e.target.value)}
            placeholder="e.g. Operator entered wrong amount; correcting via reversal."
            rows={3}
            disabled={deleteTransactionMutation.isPending}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteTransactionMutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={confirmDeleteTransaction}
            disabled={deleteTransactionMutation.isPending || reversalReason.trim().length < 3}
          >
            {deleteTransactionMutation.isPending ? "Posting reversal…" : "Post Reversal"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
