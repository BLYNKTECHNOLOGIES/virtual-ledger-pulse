
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRightLeft, Check, Trash2 } from "lucide-react";
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

interface TransferHistoryProps {
  transfers: any[];
}

export function TransferHistory({ transfers }: TransferHistoryProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  const deleteMutation = useMutation({
    mutationFn: async (transferOutId: string) => {
      const { error } = await supabase.rpc('delete_contra_entry', {
        p_transfer_out_id: transferOutId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Contra entry deleted and bank balances reversed." });
      queryClient.invalidateQueries({ queryKey: ['bank_transfers'] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts_with_balance'] });
      queryClient.invalidateQueries({ queryKey: ['bank_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['account_transactions'] });
      setDeleteTarget(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete contra entry", variant: "destructive" });
      setDeleteTarget(null);
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
            <div className="text-center py-8 text-gray-500">
              No transfers recorded yet
            </div>
          ) : (
            <div className="space-y-4">
              {filteredTransfers.map((transfer) => (
                <div
                  key={transfer.id}
                  className="flex items-center justify-between p-4 border rounded-lg bg-white hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-blue-100 rounded-full">
                      <ArrowRightLeft className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <div className="font-medium">
                        {transfer.bank_accounts?.account_name} → {transfer.related_account_name}
                      </div>
                      <div className="text-sm text-gray-600">
                        {format(new Date(transfer.transaction_date), "MMM dd, yyyy")}
                      </div>
                      {transfer.description && (
                        <div className="text-sm text-gray-500">{transfer.description}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="font-semibold text-lg">₹{parseFloat(transfer.amount.toString()).toLocaleString()}</div>
                      <div className="flex items-center gap-1 text-green-600 text-sm">
                        <Check className="h-3 w-3" />
                        Completed
                      </div>
                    </div>
                    <PermissionGate permissions={["bams_manage"]} showFallback={false}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleteTarget(transfer)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </PermissionGate>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Contra Entry</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the transfer of <strong>₹{deleteTarget ? parseFloat(deleteTarget.amount.toString()).toLocaleString() : ''}</strong> from{' '}
              <strong>{deleteTarget?.bank_accounts?.account_name}</strong> to{' '}
              <strong>{deleteTarget?.related_account_name}</strong> and reverse the bank balances.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete & Reverse"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
