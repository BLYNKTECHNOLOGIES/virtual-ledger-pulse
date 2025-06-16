
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface BankAccount {
  id: string;
  account_name: string;
  bank_name: string;
  account_number: string;
  IFSC: string; // Updated to match database column name
  branch?: string;
  balance: number;
  status: "ACTIVE" | "INACTIVE";
  created_at: string;
  updated_at: string;
}

export function BankAccountManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [formData, setFormData] = useState({
    account_name: "",
    bank_name: "",
    account_number: "",
    ifsc_code: "",
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
      return data as BankAccount[];
    },
  });

  // Create bank account mutation
  const createAccountMutation = useMutation({
    mutationFn: async (accountData: typeof formData) => {
      const { error } = await supabase
        .from('bank_accounts')
        .insert({
          account_name: accountData.account_name,
          bank_name: accountData.bank_name,
          account_number: accountData.account_number,
          IFSC: accountData.ifsc_code, // Map form field to database column
          branch: accountData.branch || null,
          balance: parseFloat(accountData.balance),
          status: accountData.status
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Bank Account Created",
        description: "New bank account has been successfully added.",
      });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
      resetForm();
      setIsAddDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create bank account",
        variant: "destructive",
      });
    },
  });

  // Update bank account mutation
  const updateAccountMutation = useMutation({
    mutationFn: async (accountData: typeof formData & { id: string }) => {
      const { error } = await supabase
        .from('bank_accounts')
        .update({
          account_name: accountData.account_name,
          bank_name: accountData.bank_name,
          account_number: accountData.account_number,
          IFSC: accountData.ifsc_code, // Map form field to database column
          branch: accountData.branch || null,
          balance: parseFloat(accountData.balance),
          status: accountData.status,
          updated_at: new Date().toISOString()
        })
        .eq('id', accountData.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Bank Account Updated",
        description: "Bank account has been successfully updated.",
      });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
      resetForm();
      setIsAddDialogOpen(false);
      setEditingAccount(null);
    },
    onError: (error: any) => {
      if (error.message.includes('cannot be negative')) {
        toast({
          title: "Invalid Balance",
          description: "Bank account balance cannot be negative.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: error.message || "Failed to update bank account",
          variant: "destructive",
        });
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingAccount) {
      updateAccountMutation.mutate({ ...formData, id: editingAccount.id });
    } else {
      createAccountMutation.mutate(formData);
    }
  };

  const handleEdit = (account: BankAccount) => {
    setEditingAccount(account);
    setFormData({
      account_name: account.account_name,
      bank_name: account.bank_name,
      account_number: account.account_number,
      ifsc_code: account.IFSC || "", // Map database column to form field
      branch: account.branch || "",
      balance: account.balance.toString(),
      status: account.status
    });
    setIsAddDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      account_name: "",
      bank_name: "",
      account_number: "",
      ifsc_code: "",
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
          <h2 className="text-2xl font-bold text-gray-900">Bank Account Management</h2>
          <p className="text-gray-600">Manage centralized bank accounts for receiving sales and purchase payments</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
          setIsAddDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Add Bank Account
            </Button>
          </DialogTrigger>
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
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="bank_name">Bank Name *</Label>
                  <Input
                    id="bank_name"
                    value={formData.bank_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, bank_name: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="account_number">Account Number *</Label>
                  <Input
                    id="account_number"
                    value={formData.account_number}
                    onChange={(e) => setFormData(prev => ({ ...prev, account_number: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="ifsc_code">IFSC Code *</Label>
                  <Input
                    id="ifsc_code"
                    value={formData.ifsc_code}
                    onChange={(e) => setFormData(prev => ({ ...prev, ifsc_code: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="branch">Branch</Label>
                  <Input
                    id="branch"
                    value={formData.branch}
                    onChange={(e) => setFormData(prev => ({ ...prev, branch: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="balance">Initial Balance (₹) *</Label>
                  <Input
                    id="balance"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.balance}
                    onChange={(e) => setFormData(prev => ({ ...prev, balance: e.target.value }))}
                    required
                  />
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
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={createAccountMutation.isPending || updateAccountMutation.isPending}
                >
                  {createAccountMutation.isPending || updateAccountMutation.isPending ? 
                    "Processing..." : 
                    (editingAccount ? "Update Account" : "Add Account")
                  }
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
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
                  <TableHead>Branch</TableHead>
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
                    <TableCell>{account.account_number}</TableCell>
                    <TableCell>{account.IFSC}</TableCell>
                    <TableCell>{account.branch || "-"}</TableCell>
                    <TableCell className={account.balance < 0 ? "text-red-600 font-bold" : ""}>
                      ₹{account.balance.toLocaleString()}
                    </TableCell>
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
                {bankAccounts?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                      No bank accounts found. Add your first bank account to get started.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
