
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Smartphone, Building } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface SalesPaymentMethod {
  id: string;
  type: "UPI" | "Bank Account";
  upi_id?: string;
  bank_account_id?: string;
  bank_accounts?: {
    account_name: string;
    bank_name: string;
    account_number: string;
  };
  risk_category: "High Risk" | "Medium Risk" | "Low Risk" | "No Risk";
  payment_limit: number;
  frequency: "24 hours" | "Daily" | "48 hours" | "Custom";
  custom_frequency?: string;
  current_usage: number;
  is_active: boolean;
}

export function PaymentMethodManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingMethod, setEditingMethod] = useState<SalesPaymentMethod | null>(null);
  const [formData, setFormData] = useState({
    type: "UPI" as "UPI" | "Bank Account",
    upi_id: "",
    bank_account_id: "",
    risk_category: "Medium Risk" as "High Risk" | "Medium Risk" | "Low Risk" | "No Risk",
    payment_limit: "",
    frequency: "Daily" as "24 hours" | "Daily" | "48 hours" | "Custom",
    custom_frequency: "",
    is_active: true
  });

  // Fetch sales payment methods
  const { data: paymentMethods, isLoading } = useQuery({
    queryKey: ['sales_payment_methods'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_payment_methods')
        .select(`
          *,
          bank_accounts (
            account_name,
            bank_name,
            account_number
          )
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as SalesPaymentMethod[];
    },
  });

  // Fetch active bank accounts for dropdown
  const { data: bankAccounts } = useQuery({
    queryKey: ['active_bank_accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('id, account_name, bank_name, account_number, IFSC')
        .eq('status', 'ACTIVE')
        .order('account_name');
      
      if (error) throw error;
      return data;
    },
  });

  // Create payment method mutation
  const createMethodMutation = useMutation({
    mutationFn: async (methodData: typeof formData) => {
      // Validate that bank account is selected
      if (!methodData.bank_account_id) {
        throw new Error("Bank account selection is required for all payment methods");
      }

      const { error } = await supabase
        .from('sales_payment_methods')
        .insert({
          type: methodData.type,
          upi_id: methodData.type === "UPI" ? methodData.upi_id : null,
          bank_account_id: methodData.bank_account_id, // Always required now
          risk_category: methodData.risk_category,
          payment_limit: parseFloat(methodData.payment_limit),
          frequency: methodData.frequency,
          custom_frequency: methodData.frequency === "Custom" ? methodData.custom_frequency : null,
          is_active: methodData.is_active
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Payment Method Created",
        description: "New payment method has been successfully added and linked to bank account.",
      });
      queryClient.invalidateQueries({ queryKey: ['sales_payment_methods'] });
      resetForm();
      setIsAddDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create payment method",
        variant: "destructive",
      });
    },
  });

  // Update payment method mutation
  const updateMethodMutation = useMutation({
    mutationFn: async (methodData: typeof formData & { id: string }) => {
      // Validate that bank account is selected
      if (!methodData.bank_account_id) {
        throw new Error("Bank account selection is required for all payment methods");
      }

      const { error } = await supabase
        .from('sales_payment_methods')
        .update({
          type: methodData.type,
          upi_id: methodData.type === "UPI" ? methodData.upi_id : null,
          bank_account_id: methodData.bank_account_id, // Always required now
          risk_category: methodData.risk_category,
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
        title: "Payment Method Updated",
        description: "Payment method has been successfully updated.",
      });
      queryClient.invalidateQueries({ queryKey: ['sales_payment_methods'] });
      resetForm();
      setIsAddDialogOpen(false);
      setEditingMethod(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update payment method",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Additional validation
    if (!formData.bank_account_id) {
      toast({
        title: "Validation Error",
        description: "Please select a bank account. All payment methods must be linked to a bank account.",
        variant: "destructive",
      });
      return;
    }

    if (formData.type === "UPI" && !formData.upi_id.trim()) {
      toast({
        title: "Validation Error",
        description: "UPI ID is required for UPI payment methods.",
        variant: "destructive",
      });
      return;
    }
    
    if (editingMethod) {
      updateMethodMutation.mutate({ ...formData, id: editingMethod.id });
    } else {
      createMethodMutation.mutate(formData);
    }
  };

  const handleEdit = (method: SalesPaymentMethod) => {
    setEditingMethod(method);
    setFormData({
      type: method.type,
      upi_id: method.upi_id || "",
      bank_account_id: method.bank_account_id || "",
      risk_category: method.risk_category,
      payment_limit: method.payment_limit.toString(),
      frequency: method.frequency,
      custom_frequency: method.custom_frequency || "",
      is_active: method.is_active
    });
    setIsAddDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      type: "UPI",
      upi_id: "",
      bank_account_id: "",
      risk_category: "Medium Risk",
      payment_limit: "",
      frequency: "Daily",
      custom_frequency: "",
      is_active: true
    });
    setEditingMethod(null);
  };

  const getRiskBadgeColor = (risk: string) => {
    switch (risk) {
      case "High Risk": return "bg-red-100 text-red-800";
      case "Medium Risk": return "bg-yellow-100 text-yellow-800";
      case "Low Risk": return "bg-blue-100 text-blue-800";
      case "No Risk": return "bg-green-100 text-green-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Sales Payment Methods</h2>
          <p className="text-gray-600">Manage UPI and bank account payment methods with risk categories for sales. All methods must be linked to a bank account.</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
          setIsAddDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Add Payment Method
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingMethod ? "Edit Payment Method" : "Add New Payment Method"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="bank_account_id">Select Bank Account *</Label>
                  <Select 
                    value={formData.bank_account_id} 
                    onValueChange={(value) => setFormData(prev => ({ ...prev, bank_account_id: value }))}
                  >
                    <SelectTrigger className={!formData.bank_account_id ? "border-red-300" : ""}>
                      <SelectValue placeholder="Select bank account (Required)" />
                    </SelectTrigger>
                    <SelectContent>
                      {bankAccounts?.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          <div className="flex flex-col">
                            <span className="font-medium">{account.account_name}</span>
                            <span className="text-sm text-gray-500">
                              {account.bank_name} - {account.account_number} ({account.IFSC})
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-600 mt-1">
                    All sales through this method will be credited to this bank account
                  </p>
                </div>

                <div>
                  <Label htmlFor="type">Payment Type *</Label>
                  <Select value={formData.type} onValueChange={(value: "UPI" | "Bank Account") => 
                    setFormData(prev => ({ ...prev, type: value, upi_id: "" }))
                  }>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UPI">UPI</SelectItem>
                      <SelectItem value="Bank Account">Bank Account</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {formData.type === "UPI" && (
                  <div className="col-span-2">
                    <Label htmlFor="upi_id">UPI ID *</Label>
                    <Input
                      id="upi_id"
                      value={formData.upi_id}
                      onChange={(e) => setFormData(prev => ({ ...prev, upi_id: e.target.value }))}
                      placeholder="user@paytm"
                      className={formData.type === "UPI" && !formData.upi_id.trim() ? "border-red-300" : ""}
                    />
                  </div>
                )}

                <div>
                  <Label htmlFor="risk_category">Risk Category *</Label>
                  <Select value={formData.risk_category} onValueChange={(value: "High Risk" | "Medium Risk" | "Low Risk" | "No Risk") => 
                    setFormData(prev => ({ ...prev, risk_category: value }))
                  }>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="High Risk">High Risk</SelectItem>
                      <SelectItem value="Medium Risk">Medium Risk</SelectItem>
                      <SelectItem value="Low Risk">Low Risk</SelectItem>
                      <SelectItem value="No Risk">No Risk</SelectItem>
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
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                />
                <Label htmlFor="is_active">Active Payment Method</Label>
              </div>

              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Important:</strong> All sales transactions through this payment method will be automatically credited to the selected bank account. This ensures proper financial tracking and reconciliation.
                </p>
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

      <Card>
        <CardHeader>
          <CardTitle>Sales Payment Methods</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Loading payment methods...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Payment Details</TableHead>
                  <TableHead>Linked Bank Account</TableHead>
                  <TableHead>Risk Category</TableHead>
                  <TableHead>Limit</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paymentMethods?.map((method) => (
                  <TableRow key={method.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {method.type === "UPI" ? (
                          <Smartphone className="h-4 w-4" />
                        ) : (
                          <Building className="h-4 w-4" />
                        )}
                        {method.type}
                      </div>
                    </TableCell>
                    <TableCell>
                      {method.type === "UPI" ? (
                        <div className="flex flex-col">
                          <span className="font-medium">{method.upi_id}</span>
                        </div>
                      ) : (
                        <div className="flex flex-col">
                          <span className="font-medium">Bank Transfer</span>
                          <span className="text-sm text-gray-500">
                            Direct bank account payment
                          </span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {method.bank_accounts ? (
                        <div className="flex flex-col">
                          <span className="font-medium">{method.bank_accounts.account_name}</span>
                          <span className="text-sm text-gray-500">
                            {method.bank_accounts.bank_name} - {method.bank_accounts.account_number}
                          </span>
                        </div>
                      ) : (
                        <Badge variant="destructive">No Bank Account Linked</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={getRiskBadgeColor(method.risk_category)}>
                        {method.risk_category}
                      </Badge>
                    </TableCell>
                    <TableCell>₹{method.payment_limit.toLocaleString()}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>₹{method.current_usage.toLocaleString()}</span>
                        <span className="text-xs text-gray-500">
                          ({((method.current_usage / method.payment_limit) * 100).toFixed(1)}%)
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{method.frequency}</TableCell>
                    <TableCell>
                      <Badge variant={method.is_active ? "default" : "destructive"}>
                        {method.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(method)}
                        className="flex items-center gap-1"
                      >
                        <Edit className="h-3 w-3" />
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {paymentMethods?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-gray-500">
                      No payment methods found. Add your first payment method to get started.
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
