
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowRightLeft, Check, Undo2 } from "lucide-react";
import { format } from "date-fns";
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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { PermissionGate } from "@/components/PermissionGate";
import { ReversalBadge } from "@/components/stock/ReversalBadge";

interface TransferHistoryProps {
  transfers: any[];
}

export function TransferHistory({ transfers }: TransferHistoryProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [reverseTarget, setReverseTarget] = useState<any>(null);
  const [reason, setReason] = useState("");

  const reverseMutation = useMutation({
    mutationFn: async ({ transfer, reason }: { transfer: any; reason: string }) => {
      const transferOutId = transfer.id;
      let transferInId = transfer.related_transaction_id;

      if (!transferInId) {
        const { data: linkedIn } = await supabase
          .from('bank_transactions')
          .select('id')
          .eq('related_transaction_id', transferOutId)
          .eq('transaction_type', 'TRANSFER_IN')
          .maybeSingle();
        transferInId = linkedIn?.id || null;
      }

      // Reverse the TRANSFER_IN leg first (destination), then TRANSFER_OUT (source).
      // The new RPC posts counter-entries (TRANSFER_OUT/TRANSFER_IN) — the immutable
      // ledger trigger automatically restamps balance_before/after on each new row.
      if (transferInId) {
        const { error: errIn } = await supabase.rpc('reverse_bank_transaction', {
          p_original_id: transferInId,
          p_reason: `Transfer reversal — ${reason}`,
        });
        if (errIn) throw errIn;
      }

      const { error: errOut } = await supabase.rpc('reverse_bank_transaction', {
        p_original_id: transferOutId,
        p_reason: `Transfer reversal — ${reason}`,
      });
      if (errOut) throw errOut;
    },
    onSuccess: () => {
      toast({ title: "Transfer reversed", description: "Counter-entries posted; running balances updated." });
      queryClient.invalidateQueries({ queryKey: ['bank_transfers'] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts_with_balance'] });
      queryClient.invalidateQueries({ queryKey: ['bank_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['account_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['active_non_dormant_bank_accounts'] });
      setReverseTarget(null);
      setReason("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to reverse transfer", variant: "destructive" });
    },
  });

  const filteredTransfers = transfers?.filter(t => t.transaction_type === 'TRANSFER_OUT') || [];

  return (
    <>
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Recent Transfers</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredTransfers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No transfers recorded yet
            </div>
          ) : (
            <div className="space-y-4">
              {filteredTransfers.map((transfer) => (
                <div
                  key={transfer.id}
                  className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-blue-100 rounded-full">
                      <ArrowRightLeft className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        {transfer.bank_accounts?.account_name} → {transfer.related_account_name}
                        <ReversalBadge
                          isReversed={transfer.is_reversed}
                          reversesTransactionId={transfer.reverses_transaction_id}
                          description={transfer.description}
                        />
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {format(new Date(transfer.transaction_date), "MMM dd, yyyy")}
                      </div>
                      {transfer.description && (
                        <div className="text-sm text-muted-foreground">{transfer.description}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="font-semibold text-lg">₹{parseFloat(transfer.amount.toString()).toLocaleString('en-IN')}</div>
                      <div className="flex items-center gap-1 text-green-600 text-sm">
                        <Check className="h-3 w-3" />
                        Completed
                      </div>
                    </div>
                    <PermissionGate permissions={["bams_destructive"]} showFallback={false}>
                      {!transfer.is_reversed && !transfer.reverses_transaction_id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setReverseTarget(transfer)}
                          disabled={reverseMutation.isPending}
                          title="Reverse transfer (posts counter-entries)"
                        >
                          <Undo2 className="h-4 w-4" />
                        </Button>
                      )}
                    </PermissionGate>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!reverseTarget} onOpenChange={(open) => { if (!open) { setReverseTarget(null); setReason(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reverse Contra Entry</AlertDialogTitle>
            <AlertDialogDescription>
              This will post counter-entries to reverse the transfer of <strong>₹{reverseTarget ? parseFloat(reverseTarget.amount.toString()).toLocaleString('en-IN') : ''}</strong> from{' '}
              <strong>{reverseTarget?.bank_accounts?.account_name}</strong> to{' '}
              <strong>{reverseTarget?.related_account_name}</strong>. The original entries are kept (marked Reversed); two new linked rows will offset the balances. The audit trail is preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="reverse-reason">Reason for reversal <span className="text-destructive">*</span></Label>
            <Textarea
              id="reverse-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. transfer entered to wrong account, duplicate booking"
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reverseMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (reverseTarget && reason.trim()) reverseMutation.mutate({ transfer: reverseTarget, reason: reason.trim() });
              }}
              disabled={reverseMutation.isPending || !reason.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {reverseMutation.isPending ? "Reversing..." : "Post Reversal"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
