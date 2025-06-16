
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Eye, EyeOff } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export function BankAccountManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any>(null);
  const [formData, setFormData] = useState({
    account_name: "",
    bank_name: "",
    account_number: "",
    IFSC: "",
    branch: "",
    balance: "",
    status: "ACTIVE" as "ACTIVE" | "INACTIVE"
  });

  // Fetch bank accounts from database
  const { data: bankAccounts, isLoading } = useQuery({
    queryKey: ['bank_accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const createBankAccountMutation = useMutation({
    mutationFn: async (accountData: any) => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .insert([{
          ...accountData,
          balance: parseFloat(accountData.balance) || 0
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Bank Account Added",
        description: "New bank account has been successfully added to the central database.",
      });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
      resetForm();
      setIsAddDialogOpen(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to add bank account: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const updateBankAccountMutation = useMutation({
    mutationFn: async (accountData: any) => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .update({
          ...accountData,
          balance: parseFloat(accountData.balance) || 0,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingAccount.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Bank Account Updated",
        description: "Bank account has been successfully updated.",
      });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
      resetForm();
      setIsAddDialogOpen(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to update bank account: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingAccount) {
      updateBankAccountMutation.mutate(formData);
    } else {
      createBankAccountMutation.mutate(formData);
    }
  };

  const handleEdit = (account: any) => {
    setEditingAccount(account);
    setFormData({
      account_name: account.account_name || "",
      bank_name: account.bank_name || "",
      account_number: account.account_number || "",
      IFSC: account.IFSC || "",
      branch: account.branch || "",
      balance: account.balance?.toString() || "0",
      status: account.status || "ACTIVE"
    });
    setIsAddDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      account_name: "",
      bank_name: "",
      account_number: "",
      IFSC: "",
      branch: "",
      balance: "",
      status: "ACTIVE"
    });
    setEditingAccount(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Central Bank Account Management</h2>
          <p className="text-gray-600">Manage bank accounts for both sales and purchase operations</p>
        </div>
        <Button 
          onClick={() => setIsAddDialogOpen(true)}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Add Bank Account
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bank Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Loading bank accounts...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account Name</TableHead>
                  <TableHead>Bank Name</TableHead>
                  <TableHead>Account Number</TableHead>
                  <TableHead>IFSC Code</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bankAccounts?.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell className="font-medium">{account.account_name}</TableCell>
                    <TableCell>{account.bank_name}</TableCell>
                    <TableCell className="font-mono">{account.account_number}</TableCell>
                    <TableCell className="font-mono">{account.IFSC}</TableCell>
                    <TableCell className="font-medium">₹{account.balance?.toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant={account.status === "ACTIVE" ? "default" : "destructive"}>
                        {account.status === "ACTIVE" ? (
                          <><Eye className="h-3 w-3 mr-1" /> Active</>
                        ) : (
                          <><EyeOff className="h-3 w-3 mr-1" /> Inactive</>
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(account)}
                        className="flex items-center gap-1"
                      >
                        <Edit className="h-3 w-3" />
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          
          {bankAccounts?.length === 0 && !isLoading && (
            <div className="text-center py-8 text-gray-500">
              No bank accounts found. Add your first bank account to get started.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Bank Account Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
        setIsAddDialogOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingAccount ? "Edit Bank Account" : "Add New Bank Account"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="account_name">Account Name *</Label>
                <Input
                  id="account_name"
                  value={formData.account_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, account_name: e.target.value }))}
                  placeholder="e.g., Blynk Virtual Technologies"
                  required
                />
              </div>
              <div>
                <Label htmlFor="bank_name">Bank Name *</Label>
                <Input
                  id="bank_name"
                  value={formData.bank_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, bank_name: e.target.value }))}
                  placeholder="e.g., HDFC Bank"
                  required
                />
              </div>
              <div>
                <Label htmlFor="account_number">Account Number *</Label>
                <Input
                  id="account_number"
                  value={formData.account_number}
                  onChange={(e) => setFormData(prev => ({ ...prev, account_number: e.target.value }))}
                  placeholder="Enter account number"
                  required
                />
              </div>
              <div>
                <Label htmlFor="IFSC">IFSC Code *</Label>
                <Input
                  id="IFSC"
                  value={formData.IFSC}
                  onChange={(e) => setFormData(prev => ({ ...prev, IFSC: e.target.value }))}
                  placeholder="e.g., HDFC0001234"
                  required
                />
              </div>
              <div>
                <Label htmlFor="branch">Branch</Label>
                <Input
                  id="branch"
                  value={formData.branch}
                  onChange={(e) => setFormData(prev => ({ ...prev, branch: e.target.value }))}
                  placeholder="Branch name/location"
                />
              </div>
              <div>
                <Label htmlFor="balance">Current Balance (₹) *</Label>
                <Input
                  id="balance"
                  type="number"
                  step="0.01"
                  value={formData.balance}
                  onChange={(e) => setFormData(prev => ({ ...prev, balance: e.target.value }))}
                  placeholder="0.00"
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="status">Account Status *</Label>
              <Select value={formData.status} onValueChange={(value: "ACTIVE" | "INACTIVE") => 
                setFormData(prev => ({ ...prev, status: value }))
              }>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="INACTIVE">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={createBankAccountMutation.isPending || updateBankAccountMutation.isPending}
              >
                {editingAccount ? "Update Account" : "Add Account"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
