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
import { logActionWithCurrentUser, ActionTypes, EntityTypes, Modules, getCurrentUserId } from "@/lib/system-action-logger";

interface ManualBalanceAdjustmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ADJUSTMENT_ACCOUNT_NAME = "Balance Adjustment Account";

export function ManualBalanceAdjustmentDialog({ open, onOpenChange }: ManualBalanceAdjustmentDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    bank_account_id: "",
    adjustment_type: "CREDIT",
    amount: "",
    reason: ""
  });

  // Fetch bank accounts (excluding dormant)
  const { data: bankAccounts } = useQuery({
    queryKey: ['bank_accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('status', 'ACTIVE')
        .is('dormant_at', null) // Exclude dormant accounts
        .order('account_name');
      if (error) throw error;
      return data;
    }
  });

  // Get or create adjustment account
  const ensureAdjustmentAccount = async () => {
    // Check if adjustment account exists
    const { data: existing } = await supabase
      .from('bank_accounts')
      .select('id')
      .eq('account_name', ADJUSTMENT_ACCOUNT_NAME)
      .single();

    if (existing) return existing.id;

    // Create adjustment account if it doesn't exist
    const { data: newAccount, error } = await supabase
      .from('bank_accounts')
      .insert({
        account_name: ADJUSTMENT_ACCOUNT_NAME,
        bank_name: "Internal",
        account_number: "ADJ-ACCOUNT-001",
        IFSC: "INTERNAL0001",
        balance: 0,
        status: "ACTIVE",
        account_type: "CURRENT",
        bank_account_holder_name: "System Adjustment Account"
      })
      .select('id')
      .single();

    if (error) throw error;
    return newAccount?.id;
  };

  const adjustmentMutation = useMutation({
    mutationFn: async () => {
      const amount = parseFloat(formData.amount);
      if (isNaN(amount) || amount <= 0) {
        throw new Error("Please enter a valid amount");
      }

      const selectedAccount = bankAccounts?.find(a => a.id === formData.bank_account_id);
      if (!selectedAccount) throw new Error("Please select a bank account");

      // Ensure adjustment account exists
      const adjustmentAccountId = await ensureAdjustmentAccount();

      const isCredit = formData.adjustment_type === "CREDIT";
      const transactionDate = new Date().toISOString().split('T')[0];
      const refNumber = `ADJ-${Date.now()}`;

      // Create transaction entries for both accounts (contra entry)
      const currentUserId = getCurrentUserId();
      const transactions = [
        {
          bank_account_id: formData.bank_account_id,
          amount,
          transaction_type: isCredit ? "DEPOSIT" : "WITHDRAWAL",
          transaction_date: transactionDate,
          description: `Manual Balance Adjustment: ${formData.reason}`,
          reference_number: refNumber,
          category: "ADJUSTMENT",
          related_account_name: ADJUSTMENT_ACCOUNT_NAME,
          created_by: currentUserId || null, // Persist user ID for audit trail
        },
        {
          bank_account_id: adjustmentAccountId,
          amount,
          transaction_type: isCredit ? "WITHDRAWAL" : "DEPOSIT",
          transaction_date: transactionDate,
          description: `Contra Entry - Adjustment for ${selectedAccount.account_name}: ${formData.reason}`,
          reference_number: refNumber,
          category: "ADJUSTMENT",
          related_account_name: selectedAccount.account_name,
          created_by: currentUserId || null, // Persist user ID for audit trail
        }
      ];

      const { error: txError } = await supabase
        .from('bank_transactions')
        .insert(transactions);

      if (txError) throw txError;
    },
    onSuccess: () => {
      // Log the action
      logActionWithCurrentUser({
        actionType: ActionTypes.BANK_BALANCE_ADJUSTED,
        entityType: EntityTypes.BANK_ACCOUNT,
        entityId: formData.bank_account_id,
        module: Modules.BAMS,
        metadata: { adjustment_type: formData.adjustment_type, amount: formData.amount, reason: formData.reason }
      });
      
      toast({
        title: "Adjustment Recorded",
        description: "Balance adjustment has been recorded with a contra entry in the adjustment account."
      });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
      queryClient.invalidateQueries({ queryKey: ['bank_transactions'] });
      onOpenChange(false);
      setFormData({
        bank_account_id: "",
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

  const selectedAccount = bankAccounts?.find(a => a.id === formData.bank_account_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Manual Balance Adjustment
          </DialogTitle>
          <DialogDescription>
            Adjust bank account balance manually. This creates a contra entry in the adjustment account.
          </DialogDescription>
        </DialogHeader>

        <Alert className="border-amber-500 text-amber-700 bg-amber-50">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Manual adjustments are tracked for audit purposes. A corresponding entry will be created in the Balance Adjustment Account.
          </AlertDescription>
        </Alert>

        <form onSubmit={(e) => { e.preventDefault(); adjustmentMutation.mutate(); }} className="space-y-4">
          <div>
            <Label>Select Bank Account</Label>
            <Select 
              value={formData.bank_account_id} 
              onValueChange={(value) => setFormData(prev => ({ ...prev, bank_account_id: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose account to adjust" />
              </SelectTrigger>
              <SelectContent>
                {bankAccounts?.filter(a => a.account_name !== ADJUSTMENT_ACCOUNT_NAME).map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.account_name} - ₹{account.balance.toFixed(2)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedAccount && (
            <div className="bg-muted p-3 rounded-md text-sm">
              <div className="flex justify-between">
                <span>Current Balance:</span>
                <span className="font-medium">₹{selectedAccount.balance.toFixed(2)}</span>
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
            <Label>Amount (₹)</Label>
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

          {selectedAccount && formData.amount && (
            <div className="bg-blue-50 p-3 rounded-md text-sm text-blue-700">
              <div className="flex justify-between">
                <span>New Balance (after adjustment):</span>
                <span className="font-medium">
                  ₹{(formData.adjustment_type === "CREDIT" 
                    ? selectedAccount.balance + parseFloat(formData.amount || "0")
                    : selectedAccount.balance - parseFloat(formData.amount || "0")
                  ).toFixed(2)}
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
