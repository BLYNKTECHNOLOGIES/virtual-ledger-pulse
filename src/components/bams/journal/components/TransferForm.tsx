
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, ArrowRightLeft } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { validateBankAccountBalance, ValidationError } from "@/utils/validations";
import { useAuth } from "@/hooks/useAuth";

interface TransferFormProps {
  bankAccounts: any[];
}

export function TransferForm({ bankAccounts }: TransferFormProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    fromAccountId: "",
    toAccountId: "",
    amount: "",
    date: undefined as Date | undefined,
    description: ""
  });

  const createTransferMutation = useMutation({
    mutationFn: async (transferData: typeof formData) => {
      const fromAccount = bankAccounts?.find(acc => acc.id === transferData.fromAccountId);
      const toAccount = bankAccounts?.find(acc => acc.id === transferData.toAccountId);

      if (!fromAccount || !toAccount) {
        throw new Error("Invalid account selection");
      }

      const transferAmount = parseFloat(transferData.amount);

      // Validate bank account balance before proceeding
      try {
        await validateBankAccountBalance(transferData.fromAccountId, transferAmount);
      } catch (error) {
        if (error instanceof ValidationError) {
          throw error;
        }
        throw new Error('Failed to validate bank account balance');
      }

      // Create transfer out transaction
      const { data: transferOutData, error: transferOutError } = await supabase
        .from('bank_transactions')
        .insert({
          bank_account_id: transferData.fromAccountId,
          transaction_type: 'TRANSFER_OUT',
          amount: transferAmount,
          description: transferData.description || `Transfer to ${toAccount.account_name}`,
          transaction_date: transferData.date ? format(transferData.date, 'yyyy-MM-dd') : null,
          reference_number: `TRF-OUT-${Date.now()}`,
          related_account_name: toAccount.account_name,
          created_by: user?.id || null, // Persist user ID for audit trail
        })
        .select()
        .single();

      if (transferOutError) throw transferOutError;

      // Create transfer in transaction
      const { data: transferInData, error: transferInError } = await supabase
        .from('bank_transactions')
        .insert({
          bank_account_id: transferData.toAccountId,
          transaction_type: 'TRANSFER_IN',
          amount: transferAmount,
          description: transferData.description || `Transfer from ${fromAccount.account_name}`,
          transaction_date: transferData.date ? format(transferData.date, 'yyyy-MM-dd') : null,
          reference_number: `TRF-IN-${Date.now()}`,
          related_account_name: fromAccount.account_name,
          related_transaction_id: transferOutData.id,
          created_by: user?.id || null, // Persist user ID for audit trail
        })
        .select()
        .single();

      if (transferInError) throw transferInError;

      // Update the transfer out transaction with the related transaction ID
      await supabase
        .from('bank_transactions')
        .update({ related_transaction_id: transferInData.id })
        .eq('id', transferOutData.id);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Fund transfer completed successfully. Bank balances updated automatically.",
      });
      queryClient.invalidateQueries({ queryKey: ['bank_transfers'] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts_with_balance'] });
      queryClient.invalidateQueries({ queryKey: ['bank_transactions'] });
      setFormData({
        fromAccountId: "",
        toAccountId: "",
        amount: "",
        date: undefined,
        description: ""
      });
    },
    onError: (error: any) => {
      const message = error instanceof ValidationError ? error.message : (error.message || "Failed to complete transfer");
      toast({
        title: "Error",
        description: message,
        variant: "destructive"
      });
    },
  });

  const handleTransfer = () => {
    if (!formData.fromAccountId || !formData.toAccountId || !formData.amount || !formData.date) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    if (formData.fromAccountId === formData.toAccountId) {
      toast({
        title: "Error",
        description: "From and To accounts must be different",
        variant: "destructive"
      });
      return;
    }

    const amount = parseFloat(formData.amount);
    if (amount <= 0) {
      toast({
        title: "Error",
        description: "Transfer amount must be greater than 0",
        variant: "destructive"
      });
      return;
    }

    createTransferMutation.mutate(formData);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ArrowRightLeft className="h-5 w-5" />
          Bank to Bank Transfer
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="fromAccount">From Bank Account *</Label>
            <Select value={formData.fromAccountId} onValueChange={(value) => setFormData({...formData, fromAccountId: value})}>
              <SelectTrigger>
                <SelectValue placeholder="Select source account" />
              </SelectTrigger>
              <SelectContent>
                {bankAccounts?.filter(account => !account.dormant_at).map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.account_name} - {account.bank_name}
                    <span className="text-sm text-gray-500 ml-2">
                      (₹{parseFloat(account.balance.toString()).toLocaleString()})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="toAccount">To Bank Account *</Label>
            <Select value={formData.toAccountId} onValueChange={(value) => setFormData({...formData, toAccountId: value})}>
              <SelectTrigger>
                <SelectValue placeholder="Select destination account" />
              </SelectTrigger>
              <SelectContent>
                {bankAccounts?.filter(account => !account.dormant_at).map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.account_name} - {account.bank_name}
                    <span className="text-sm text-gray-500 ml-2">
                      (₹{parseFloat(account.balance.toString()).toLocaleString()})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="amount">Transfer Amount (₹) *</Label>
            <Input
              id="amount"
              type="number"
              placeholder="0.00"
              value={formData.amount}
              onChange={(e) => setFormData({...formData, amount: e.target.value})}
            />
          </div>

          <div>
            <Label>Transfer Date *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !formData.date && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {formData.date ? format(formData.date, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={formData.date}
                  onSelect={(date) => setFormData({...formData, date})}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Input
              id="description"
              placeholder="Transfer purpose or notes"
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
            />
          </div>

          <div className="md:col-span-2">
            <Button 
              onClick={handleTransfer} 
              className="w-full"
              disabled={createTransferMutation.isPending}
            >
              <ArrowRightLeft className="mr-2 h-4 w-4" />
              {createTransferMutation.isPending ? "Processing..." : "Transfer Funds"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
