
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Plus, Edit, Smartphone, Building, TrendingDown, AlertTriangle, Trash2, Wallet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface PurchasePaymentMethod {
  id: string;
  type: "UPI" | "Bank Transfer";
  bank_account_id: string;
  bank_accounts?: {
    account_name: string;
    bank_name: string;
    account_number: string;
    balance: number;
  };
  payment_limit: number;
  frequency: "24 hours" | "Daily" | "48 hours" | "Custom";
  custom_frequency?: string;
  current_usage: number;
  last_reset: string;
  is_active: boolean;
}

export function PurchaseManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingMethod, setEditingMethod] = useState<PurchasePaymentMethod | null>(null);
  const [formData, setFormData] = useState({
    type: "Bank Transfer" as "UPI" | "Bank Transfer",
    bank_account_id: "",
    payment_limit: "",
    frequency: "24 hours" as "24 hours" | "Daily" | "48 hours" | "Custom",
    custom_frequency: "",
    is_active: true
  });

  // Fetch purchase payment methods from database
  const { data: purchasePaymentMethods, isLoading } = useQuery({
    queryKey: ['purchase_payment_methods'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_payment_methods')
        .select(`
          *,
          bank_accounts (
            account_name,
            bank_name,
            account_number,
            balance
          )
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as PurchasePaymentMethod[];
    },
  });

  // Fetch active bank accounts for dropdown
  const { data: bankAccounts } = useQuery({
    queryKey: ['active_bank_accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('id, account_name, bank_name, account_number, IFSC, balance')
        .eq('status', 'ACTIVE')
        .order('account_name');
      
      if (error) throw error;
      return data;
    },
  });

  // Create payment method mutation
  const createMethodMutation = useMutation({
    mutationFn: async (methodData: typeof formData) => {
      const { error } = await supabase
        .from('purchase_payment_methods')
        .insert({
          type: methodData.type,
          bank_account_id: methodData.bank_account_id,
          payment_limit: parseFloat(methodData.payment_limit),
          frequency: methodData.frequency,
          custom_frequency: methodData.frequency === "Custom" ? methodData.custom_frequency : null,
          is_active: methodData.is_active
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Purchase Method Created",
        description: "New purchase payment method has been successfully added.",
      });
      queryClient.invalidateQueries({ queryKey: ['purchase_payment_methods'] });
      resetForm();
      setIsAddDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create purchase payment method",
        variant: "destructive",
      });
    },
  });

  // Update payment method mutation
  const updateMethodMutation = useMutation({
    mutationFn: async (methodData: typeof formData & { id: string }) => {
      const { error } = await supabase
        .from('purchase_payment_methods')
        .update({
          type: methodData.type,
          bank_account_id: methodData.bank_account_id,
          payment_limit: parseFloat(methodData.payment_limit),
          frequency: methodData.frequency,
          custom_frequency: methodData.frequency === "Custom" ? methodData.custom_frequency : null,
          is_active: methodData.is_active,
          updated_at: new Date().toISOString()
        })
        .eq('id', methodData.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Purchase Method Updated",
        description: "Purchase payment method has been successfully updated.",
      });
      queryClient.invalidateQueries({ queryKey: ['purchase_payment_methods'] });
      resetForm();
      setIsAddDialogOpen(false);
      setEditingMethod(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update purchase payment method",
        variant: "destructive",
      });
    },
  });

  // Delete payment method mutation
  const deleteMethodMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('purchase_payment_methods')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Purchase Method Deleted",
        description: "Purchase payment method has been successfully deleted.",
      });
      queryClient.invalidateQueries({ queryKey: ['purchase_payment_methods'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete purchase payment method",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingMethod) {
      updateMethodMutation.mutate({ ...formData, id: editingMethod.id });
    } else {
      createMethodMutation.mutate(formData);
    }
  };

  const handleEdit = (method: PurchasePaymentMethod) => {
    setEditingMethod(method);
    setFormData({
      type: method.type,
      bank_account_id: method.bank_account_id,
      payment_limit: method.payment_limit.toString(),
      frequency: method.frequency,
      custom_frequency: method.custom_frequency || "",
      is_active: method.is_active
    });
    setIsAddDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this purchase payment method?")) {
      deleteMethodMutation.mutate(id);
    }
  };

  const resetForm = () => {
    setFormData({
      type: "Bank Transfer",
      bank_account_id: "",
      payment_limit: "",
      frequency: "24 hours",
      custom_frequency: "",
      is_active: true
    });
    setEditingMethod(null);
  };

  const getAvailableLimit = (method: PurchasePaymentMethod) => {
    return method.payment_limit - method.current_usage;
  };

  const getUsagePercentage = (method: PurchasePaymentMethod) => {
    return (method.current_usage / method.payment_limit) * 100;
  };

  const getTotalAvailableUPI = () => {
    return purchasePaymentMethods
      ?.filter(m => m.type === "UPI" && m.is_active)
      .reduce((sum, m) => sum + getAvailableLimit(m), 0) || 0;
  };

  const getTotalAvailableBankTransfer = () => {
    return purchasePaymentMethods
      ?.filter(m => m.type === "Bank Transfer" && m.is_active)
      .reduce((sum, m) => sum + getAvailableLimit(m), 0) || 0;
  };

  const getTotalAccountBalance = () => {
    const linkedAccountIds = new Set(
      purchasePaymentMethods
        ?.filter(m => m.is_active)
        .map(m => m.bank_account_id)
    );
    
    return bankAccounts
      ?.filter(account => linkedAccountIds.has(account.id))
      .reduce((sum, account) => sum + account.balance, 0) || 0;
  };

  // Validation function for purchase orders
  const validatePurchaseOrder = (amount: number) => {
    const totalAvailable = getTotalAvailableUPI() + getTotalAvailableBankTransfer();
    const totalBalance = getTotalAccountBalance();
    
    if (amount > totalBalance) {
      throw new Error(`Purchase amount (₹${amount.toLocaleString()}) exceeds total account balance (₹${totalBalance.toLocaleString()})`);
    }
    
    if (amount > totalAvailable) {
      throw new Error(`Purchase amount (₹${amount.toLocaleString()}) exceeds available payment limit (₹${totalAvailable.toLocaleString()})`);
    }
    
    return true;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Purchase Management</h2>
          <p className="text-gray-600">Manage payment methods for company purchases</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
          setIsAddDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Add Purchase Method
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingMethod ? "Edit Purchase Method" : "Add New Purchase Method"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="type">Payment Method Type *</Label>
                <Select value={formData.type} onValueChange={(value: "UPI" | "Bank Transfer") => 
                  setFormData(prev => ({ ...prev, type: value }))
                }>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UPI">UPI Payment</SelectItem>
                    <SelectItem value="Bank Transfer">Bank Transfer (IMPS/NEFT)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="bank_account_id">Select Bank Account *</Label>
                <Select value={formData.bank_account_id} onValueChange={(value) => 
                  setFormData(prev => ({ ...prev, bank_account_id: value }))
                }>
                  <SelectTrigger>
                    <SelectValue placeholder="Select bank account" />
                  </SelectTrigger>
                  <SelectContent>
                    {bankAccounts?.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        <div className="flex flex-col">
                          <span className="font-medium">{account.account_name}</span>
                          <span className="text-sm text-gray-500">
                            {account.bank_name} - {account.account_number} ({account.IFSC})
                          </span>
                          <span className="text-sm text-green-600">
                            Balance: ₹{account.balance.toLocaleString()}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="payment_limit">Payment Limit (₹) *</Label>
                <Input
                  id="payment_limit"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.payment_limit}
                  onChange={(e) => setFormData(prev => ({ ...prev, payment_limit: e.target.value }))}
                  required
                />
              </div>

              <div>
                <Label htmlFor="frequency">Reset Frequency *</Label>
                <Select value={formData.frequency} onValueChange={(value: "24 hours" | "Daily" | "48 hours" | "Custom") => 
                  setFormData(prev => ({ ...prev, frequency: value }))
                }>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24 hours">24 Hours</SelectItem>
                    <SelectItem value="Daily">Daily</SelectItem>
                    <SelectItem value="48 hours">48 Hours</SelectItem>
                    <SelectItem value="Custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.frequency === "Custom" && (
                <div>
                  <Label htmlFor="custom_frequency">Custom Frequency *</Label>
                  <Input
                    id="custom_frequency"
                    value={formData.custom_frequency}
                    onChange={(e) => setFormData(prev => ({ ...prev, custom_frequency: e.target.value }))}
                    placeholder="e.g., 72 hours, Weekly"
                    required={formData.frequency === "Custom"}
                  />
                </div>
              )}

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                />
                <Label htmlFor="is_active">Active Payment Method</Label>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={createMethodMutation.isPending || updateMethodMutation.isPending}
                >
                  {createMethodMutation.isPending || updateMethodMutation.isPending ? 
                    "Processing..." : 
                    (editingMethod ? "Update Method" : "Add Method")
                  }
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Available Limits and Balance Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-blue-600" />
              Available UPI Limit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              ₹{getTotalAvailableUPI().toLocaleString()}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {purchasePaymentMethods?.filter(m => m.type === "UPI" && m.is_active).length || 0} active UPI methods
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Building className="h-4 w-4 text-green-600" />
              Available Bank Transfer Limit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              ₹{getTotalAvailableBankTransfer().toLocaleString()}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {purchasePaymentMethods?.filter(m => m.type === "Bank Transfer" && m.is_active).length || 0} active bank accounts
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Wallet className="h-4 w-4 text-orange-600" />
              Total Account Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              ₹{getTotalAccountBalance().toLocaleString()}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Linked bank accounts balance
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-purple-600" />
              Total Available
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              ₹{(getTotalAvailableUPI() + getTotalAvailableBankTransfer()).toLocaleString()}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Combined purchasing power
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Purchase Payment Methods</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Loading purchase payment methods...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Bank Account</TableHead>
                  <TableHead>Limit</TableHead>
                  <TableHead>Used</TableHead>
                  <TableHead>Available</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchasePaymentMethods?.map((method) => {
                  const usagePercentage = getUsagePercentage(method);
                  const availableLimit = getAvailableLimit(method);
                  
                  return (
                    <TableRow key={method.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {method.type === "UPI" ? (
                            <Smartphone className="h-4 w-4 text-blue-600" />
                          ) : (
                            <Building className="h-4 w-4 text-green-600" />
                          )}
                          {method.type}
                        </div>
                      </TableCell>
                      <TableCell>
                        {method.bank_accounts ? (
                          <div className="flex flex-col">
                            <span className="font-medium">{method.bank_accounts.account_name}</span>
                            <span className="text-sm text-gray-500">
                              {method.bank_accounts.bank_name} - {method.bank_accounts.account_number}
                            </span>
                            <span className="text-sm text-green-600">
                              Balance: ₹{method.bank_accounts.balance.toLocaleString()}
                            </span>
                          </div>
                        ) : (
                          <span className="text-gray-400">Bank account not found</span>
                        )}
                      </TableCell>
                      <TableCell>₹{method.payment_limit.toLocaleString()}</TableCell>
                      <TableCell>₹{method.current_usage.toLocaleString()}</TableCell>
                      <TableCell className={availableLimit === 0 ? "text-red-600 font-medium" : ""}>
                        ₹{availableLimit.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={usagePercentage} className="w-16" />
                          <span className="text-xs">{usagePercentage.toFixed(0)}%</span>
                          {usagePercentage >= 100 && (
                            <AlertTriangle className="h-4 w-4 text-red-500" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {method.frequency === "Custom" ? method.custom_frequency : method.frequency}
                      </TableCell>
                      <TableCell>
                        <Badge variant={method.is_active ? "default" : "secondary"}>
                          {method.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(method)}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(method.id)}
                            className="text-red-600 hover:text-red-700"
                            disabled={deleteMethodMutation.isPending}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {purchasePaymentMethods?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-gray-500">
                      No purchase payment methods found. Add your first payment method to get started.
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
