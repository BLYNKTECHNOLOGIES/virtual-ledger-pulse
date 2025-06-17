
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, ArrowRightLeft, Check } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function ContraEntriesTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    fromAccountId: "",
    toAccountId: "",
    amount: "",
    date: undefined as Date | undefined,
    description: ""
  });

  // Fetch bank accounts from Supabase
  const { data: bankAccounts } = useQuery({
    queryKey: ['bank_accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('status', 'ACTIVE')
        .order('account_name');
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch recent transfers
  const { data: transfers } = useQuery({
    queryKey: ['bank_transfers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_transactions')
        .select(`
          *,
          bank_accounts!bank_account_id(account_name, bank_name)
        `)
        .in('transaction_type', ['TRANSFER_IN', 'TRANSFER_OUT'])
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      return data;
    },
  });

  // Create transfer mutation
  const createTransferMutation = useMutation({
    mutationFn: async (transferData: typeof formData) => {
      const fromAccount = bankAccounts?.find(acc => acc.id === transferData.fromAccountId);
      const toAccount = bankAccounts?.find(acc => acc.id === transferData.toAccountId);

      if (!fromAccount || !toAccount) {
        throw new Error("Invalid account selection");
      }

      // Create transfer out transaction
      const { data: transferOutData, error: transferOutError } = await supabase
        .from('bank_transactions')
        .insert({
          bank_account_id: transferData.fromAccountId,
          transaction_type: 'TRANSFER_OUT',
          amount: parseFloat(transferData.amount),
          description: transferData.description || `Transfer to ${toAccount.account_name}`,
          transaction_date: transferData.date,
          reference_number: `TRF-OUT-${Date.now()}`,
          related_account_name: toAccount.account_name
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
          amount: parseFloat(transferData.amount),
          description: transferData.description || `Transfer from ${fromAccount.account_name}`,
          transaction_date: transferData.date,
          reference_number: `TRF-IN-${Date.now()}`,
          related_account_name: fromAccount.account_name,
          related_transaction_id: transferOutData.id
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
        description: "Fund transfer completed successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['bank_transfers'] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
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
      toast({
        title: "Error",
        description: error.message || "Failed to complete transfer",
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

    createTransferMutation.mutate(formData);
  };

  return (
    <div className="space-y-6">
      {/* Transfer Form */}
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
                  {bankAccounts?.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.account_name} - {account.bank_name}
                      <span className="text-sm text-gray-500 ml-2">
                        (₹{parseFloat(account.balance).toLocaleString()})
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
                  {bankAccounts?.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.account_name} - {account.bank_name}
                      <span className="text-sm text-gray-500 ml-2">
                        (₹{parseFloat(account.balance).toLocaleString()})
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

      {/* Transfer History */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Transfers</CardTitle>
        </CardHeader>
        <CardContent>
          {!transfers || transfers.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No transfers recorded yet
            </div>
          ) : (
            <div className="space-y-4">
              {transfers
                .filter(transfer => transfer.transaction_type === 'TRANSFER_OUT')
                .map((transfer) => (
                <div
                  key={transfer.id}
                  className="flex items-center justify-between p-4 border rounded-lg bg-gray-50"
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
                  <div className="text-right">
                    <div className="font-semibold text-lg">₹{parseFloat(transfer.amount).toLocaleString()}</div>
                    <div className="flex items-center gap-1 text-green-600 text-sm">
                      <Check className="h-3 w-3" />
                      Completed
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
