import { useState } from "react";
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

interface ManualWalletAdjustmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ADJUSTMENT_WALLET_NAME = "Balance Adjustment Wallet";

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
        wallet_type: "USDT",
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
      const amount = parseFloat(formData.amount);
      if (isNaN(amount) || amount <= 0) {
        throw new Error("Please enter a valid amount");
      }

      const selectedWallet = wallets?.find(w => w.id === formData.wallet_id);
      if (!selectedWallet) throw new Error("Please select a wallet");

      // Ensure adjustment wallet exists
      const adjustmentWalletId = await ensureAdjustmentWallet();

      // Get current balances
      const { data: adjWallet } = await supabase
        .from('wallets')
        .select('current_balance')
        .eq('id', adjustmentWalletId)
        .single();

      const isCredit = formData.adjustment_type === "CREDIT";
      const refId = `ADJ-${Date.now()}`;

      // Create wallet transactions for both wallets (contra entry)
      const transactions = [
        {
          wallet_id: formData.wallet_id,
          transaction_type: isCredit ? "CREDIT" : "DEBIT",
          amount,
          reference_type: "MANUAL_ADJUSTMENT",
          reference_id: refId,
          description: `Manual Balance Adjustment: ${formData.reason}`,
          balance_before: selectedWallet.current_balance,
          balance_after: isCredit 
            ? selectedWallet.current_balance + amount 
            : selectedWallet.current_balance - amount
        },
        {
          wallet_id: adjustmentWalletId,
          transaction_type: isCredit ? "DEBIT" : "CREDIT",
          amount,
          reference_type: "MANUAL_ADJUSTMENT",
          reference_id: refId,
          description: `Contra Entry - Adjustment for ${selectedWallet.wallet_name}: ${formData.reason}`,
          balance_before: adjWallet?.current_balance || 0,
          balance_after: isCredit 
            ? (adjWallet?.current_balance || 0) - amount 
            : (adjWallet?.current_balance || 0) + amount
        }
      ];

      const { error: txError } = await supabase
        .from('wallet_transactions')
        .insert(transactions);

      if (txError) throw txError;
    },
    onSuccess: () => {
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
                    {wallet.wallet_name} ({wallet.wallet_type}) - {wallet.current_balance.toFixed(2)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedWallet && (
            <div className="bg-muted p-3 rounded-md text-sm">
              <div className="flex justify-between">
                <span>Current Balance:</span>
                <span className="font-medium">{selectedWallet.current_balance.toFixed(2)} {selectedWallet.wallet_type}</span>
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
                    ? selectedWallet.current_balance + parseFloat(formData.amount || "0")
                    : selectedWallet.current_balance - parseFloat(formData.amount || "0")
                  ).toFixed(2)} {selectedWallet.wallet_type}
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
