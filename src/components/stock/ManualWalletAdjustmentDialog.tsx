import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Settings, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { logActionWithCurrentUser, ActionTypes, EntityTypes, Modules } from "@/lib/system-action-logger";

interface ManualWalletAdjustmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ADJUSTMENT_WALLET_NAME = "Balance Adjustment Wallet";

const adjustmentSchema = z.object({
  wallet_id: z.string().min(1, "Please select a wallet"),
  adjustment_type: z.enum(["CREDIT", "DEBIT"]),
  amount: z
    .string()
    .transform((v) => Number.parseFloat(v))
    .refine((v) => Number.isFinite(v) && v > 0, "Please enter a valid amount"),
  reason: z.string().trim().min(1, "Reason is required").max(500, "Reason is too long"),
});

export function ManualWalletAdjustmentDialog({ open, onOpenChange }: ManualWalletAdjustmentDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    wallet_id: "",
    adjustment_type: "CREDIT",
    amount: "",
    reason: ""
  });

  // Fetch wallets
  const { data: wallets } = useQuery({
    queryKey: ['wallets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wallets')
        .select('*')
        .eq('is_active', true)
        .order('wallet_name');
      if (error) throw error;
      return data;
    }
  });

  // Get or create adjustment wallet
  const ensureAdjustmentWallet = async () => {
    // Check if adjustment wallet exists
    const { data: existing } = await supabase
      .from('wallets')
      .select('id')
      .eq('wallet_name', ADJUSTMENT_WALLET_NAME)
      .single();

    if (existing) return existing.id;

    // Create adjustment wallet if it doesn't exist
    const { data: newWallet, error } = await supabase
      .from('wallets')
      .insert({
        wallet_name: ADJUSTMENT_WALLET_NAME,
        wallet_address: "ADJUSTMENT-WALLET-001",
        chain_name: "Internal",
        current_balance: 0,
        total_received: 0,
        total_sent: 0,
        is_active: true
      })
      .select('id')
      .single();

    if (error) throw error;
    return newWallet?.id;
  };

  const adjustmentMutation = useMutation({
    mutationFn: async () => {
      const parsed = adjustmentSchema.safeParse(formData);
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message || "Invalid input");
      }

      const { wallet_id, adjustment_type, amount, reason } = parsed.data;

      // Ensure adjustment wallet exists
      const adjustmentWalletId = await ensureAdjustmentWallet();

      // Fetch fresh balances from DB (don't rely on cached list)
      const [{ data: mainWallet, error: mainErr }, { data: adjWallet, error: adjErr }] = await Promise.all([
        supabase
          .from('wallets')
          .select('id, wallet_name, current_balance')
          .eq('id', wallet_id)
          .single(),
        supabase
          .from('wallets')
          .select('id, current_balance')
          .eq('id', adjustmentWalletId)
          .single(),
      ]);

      if (mainErr) throw mainErr;
      if (adjErr) throw adjErr;
      if (!mainWallet) throw new Error('Wallet not found');

      const mainBefore = Number(mainWallet.current_balance ?? 0);
      const adjBefore = Number(adjWallet?.current_balance ?? 0);
      const isCredit = adjustment_type === "CREDIT";
      // wallet_transactions.reference_id is a UUID column, so we must store a valid UUID
      const refId = globalThis.crypto?.randomUUID?.() ?? null;

      const mainAfter = isCredit ? mainBefore + amount : mainBefore - amount;
      const adjAfter = isCredit ? adjBefore - amount : adjBefore + amount;

      // Create wallet transactions for both wallets (contra entry)
      const transactions = [
        {
          wallet_id,
          transaction_type: isCredit ? "CREDIT" : "DEBIT",
          amount,
          reference_type: "MANUAL_ADJUSTMENT",
          reference_id: refId,
          description: `Manual Balance Adjustment${refId ? ` (${refId})` : ""}: ${reason}`,
          balance_before: mainBefore,
          balance_after: mainAfter
        },
        {
          wallet_id: adjustmentWalletId,
          transaction_type: isCredit ? "DEBIT" : "CREDIT",
          amount,
          reference_type: "MANUAL_ADJUSTMENT",
          reference_id: refId,
          description: `Contra Entry - Adjustment for ${mainWallet.wallet_name}${refId ? ` (${refId})` : ""}: ${reason}`,
          balance_before: adjBefore,
          balance_after: adjAfter
        }
      ];

      const { error: txError } = await supabase
        .from('wallet_transactions')
        .insert(transactions);

      if (txError) throw txError;

      // Update wallets table so UI reflects balances immediately
      const [{ error: updMainErr }, { error: updAdjErr }] = await Promise.all([
        supabase
          .from('wallets')
          .update({ current_balance: mainAfter })
          .eq('id', wallet_id),
        supabase
          .from('wallets')
          .update({ current_balance: adjAfter })
          .eq('id', adjustmentWalletId),
      ]);

      if (updMainErr) throw updMainErr;
      if (updAdjErr) throw updAdjErr;
    },
    onSuccess: () => {
      // Log the action
      logActionWithCurrentUser({
        actionType: ActionTypes.STOCK_WALLET_ADJUSTED,
        entityType: EntityTypes.WALLET,
        entityId: formData.wallet_id,
        module: Modules.STOCK,
        metadata: { adjustment_type: formData.adjustment_type, amount: formData.amount, reason: formData.reason }
      });
      
      toast({
        title: "Adjustment Recorded",
        description: "Wallet balance adjustment has been recorded with a contra entry in the adjustment wallet."
      });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      queryClient.invalidateQueries({ queryKey: ['wallet_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['wallet_transactions_live'] });
      queryClient.invalidateQueries({ queryKey: ['wallet_stock_summary'] });
      onOpenChange(false);
      setFormData({
        wallet_id: "",
        adjustment_type: "CREDIT",
        amount: "",
        reason: ""
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to record adjustment",
        variant: "destructive"
      });
    }
  });

  const selectedWallet = wallets?.find(w => w.id === formData.wallet_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Manual Wallet Balance Adjustment
          </DialogTitle>
          <DialogDescription>
            Adjust wallet balance manually. This creates a contra entry in the adjustment wallet.
          </DialogDescription>
        </DialogHeader>

        <Alert className="border-amber-500 text-amber-700 bg-amber-50">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Manual adjustments are tracked for audit purposes. A corresponding entry will be created in the Balance Adjustment Wallet.
          </AlertDescription>
        </Alert>

        <form onSubmit={(e) => { e.preventDefault(); adjustmentMutation.mutate(); }} className="space-y-4">
          <div>
            <Label>Select Wallet</Label>
            <Select 
              value={formData.wallet_id} 
              onValueChange={(value) => setFormData(prev => ({ ...prev, wallet_id: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose wallet to adjust" />
              </SelectTrigger>
              <SelectContent>
                {wallets?.filter(w => w.wallet_name !== ADJUSTMENT_WALLET_NAME).map((wallet) => (
                  <SelectItem key={wallet.id} value={wallet.id}>
                    {wallet.wallet_name} - {(Number(wallet.current_balance ?? 0)).toFixed(2)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedWallet && (
            <div className="bg-muted p-3 rounded-md text-sm">
              <div className="flex justify-between">
                <span>Current Balance:</span>
                <span className="font-medium">{(Number(selectedWallet.current_balance ?? 0)).toFixed(2)} USDT</span>
              </div>
            </div>
          )}

          <div>
            <Label>Adjustment Type</Label>
            <Select 
              value={formData.adjustment_type} 
              onValueChange={(value) => setFormData(prev => ({ ...prev, adjustment_type: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CREDIT">Credit (Increase Balance)</SelectItem>
                <SelectItem value="DEBIT">Debit (Decrease Balance)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Amount</Label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={formData.amount}
              onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
              placeholder="Enter adjustment amount"
              required
            />
          </div>

          <div>
            <Label>Reason for Adjustment</Label>
            <Textarea
              value={formData.reason}
              onChange={(e) => setFormData(prev => ({ ...prev, reason: e.target.value }))}
              placeholder="Provide reason for this manual adjustment..."
              required
            />
          </div>

          {selectedWallet && formData.amount && (
            <div className="bg-blue-50 p-3 rounded-md text-sm text-blue-700">
              <div className="flex justify-between">
                <span>New Balance (after adjustment):</span>
                <span className="font-medium">
                  {(formData.adjustment_type === "CREDIT" 
                    ? Number(selectedWallet.current_balance ?? 0) + parseFloat(formData.amount || "0")
                    : Number(selectedWallet.current_balance ?? 0) - parseFloat(formData.amount || "0")
                  ).toFixed(2)} USDT
                </span>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={adjustmentMutation.isPending} className="flex-1">
              {adjustmentMutation.isPending ? 'Processing...' : 'Record Adjustment'}
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
