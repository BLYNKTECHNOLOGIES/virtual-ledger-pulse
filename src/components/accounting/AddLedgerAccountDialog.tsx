
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface AddLedgerAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddLedgerAccountDialog({ open, onOpenChange }: AddLedgerAccountDialogProps) {
  const [formData, setFormData] = useState({
    name: "",
    account_code: "",
    account_type: "",
    opening_balance: "0"
  });

  const queryClient = useQueryClient();

  const addAccountMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase
        .from('ledger_accounts')
        .insert([{
          ...data,
          opening_balance: parseFloat(data.opening_balance),
          current_balance: parseFloat(data.opening_balance)
        }]);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ledger-accounts'] });
      toast({
        title: "Success",
        description: "Account added successfully",
      });
      onOpenChange(false);
      setFormData({
        name: "",
        account_code: "",
        account_type: "",
        opening_balance: "0"
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to add account",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addAccountMutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add New Ledger Account</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Account Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              required
            />
          </div>
          
          <div>
            <Label htmlFor="account_code">Account Code (Optional)</Label>
            <Input
              id="account_code"
              value={formData.account_code}
              onChange={(e) => setFormData({...formData, account_code: e.target.value})}
            />
          </div>

          <div>
            <Label htmlFor="account_type">Account Type</Label>
            <Select value={formData.account_type} onValueChange={(value) => setFormData({...formData, account_type: value})}>
              <SelectTrigger>
                <SelectValue placeholder="Select account type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ASSETS">Assets</SelectItem>
                <SelectItem value="LIABILITIES">Liabilities</SelectItem>
                <SelectItem value="INCOME">Income</SelectItem>
                <SelectItem value="EXPENSES">Expenses</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="opening_balance">Opening Balance</Label>
            <Input
              id="opening_balance"
              type="number"
              step="0.01"
              value={formData.opening_balance}
              onChange={(e) => setFormData({...formData, opening_balance: e.target.value})}
              required
            />
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={addAccountMutation.isPending}>
              {addAccountMutation.isPending ? "Adding..." : "Add Account"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
