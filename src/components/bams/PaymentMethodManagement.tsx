import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Plus, Edit, Trash2, CreditCard, Building } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export function PaymentMethodManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editingMethod, setEditingMethod] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'sales' | 'purchase'>('sales');
  
  const [formData, setFormData] = useState({
    type: "",
    upi_id: "",
    bank_account_id: "",
    risk_category: "",
    payment_limit: 0,
    frequency: "",
    custom_frequency: "",
  });

  // Fetch bank accounts from central database
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

  // Fetch sales payment methods
  const { data: salesPaymentMethods, isLoading: salesLoading } = useQuery({
    queryKey: ['sales_payment_methods'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_payment_methods')
        .select(`
          *,
          bank_accounts:bank_account_id(account_name, bank_name, balance)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch purchase payment methods
  const { data: purchasePaymentMethods, isLoading: purchaseLoading } = useQuery({
    queryKey: ['purchase_payment_methods'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_payment_methods')
        .select(`
          *,
          bank_accounts:bank_account_id(account_name, bank_name, balance)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const createSalesPaymentMethodMutation = useMutation({
    mutationFn: async (methodData: any) => {
      const { data, error } = await supabase
        .from('sales_payment_methods')
        .insert([methodData])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Sales Payment Method Created",
        description: "Payment method has been successfully created and linked to central bank account.",
      });
      queryClient.invalidateQueries({ queryKey: ['sales_payment_methods'] });
      setShowDialog(false);
      resetForm();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to create payment method: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const createPurchasePaymentMethodMutation = useMutation({
    mutationFn: async (methodData: any) => {
      const { data, error } = await supabase
        .from('purchase_payment_methods')
        .insert([methodData])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Purchase Payment Method Created",
        description: "Payment method has been successfully created and linked to central bank account.",
      });
      queryClient.invalidateQueries({ queryKey: ['purchase_payment_methods'] });
      setShowDialog(false);
      resetForm();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to create payment method: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      type: "",
      upi_id: "",
      bank_account_id: "",
      risk_category: "",
      payment_limit: 0,
      frequency: "",
      custom_frequency: "",
    });
    setEditingMethod(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const submitData = {
      ...formData,
      payment_limit: Number(formData.payment_limit),
    };

    // Remove upi_id if type is Bank Account, remove bank_account_id if type is UPI
    if (formData.type === 'Bank Account') {
      delete submitData.upi_id;
    } else if (formData.type === 'UPI') {
      delete submitData.bank_account_id;
    }

    if (activeTab === 'sales') {
      createSalesPaymentMethodMutation.mutate(submitData);
    } else {
      // For purchase, only bank account is allowed
      createPurchasePaymentMethodMutation.mutate({
        bank_account_id: formData.bank_account_id,
        payment_limit: Number(formData.payment_limit),
        frequency: formData.frequency,
        custom_frequency: formData.custom_frequency,
      });
    }
  };

  const getUsagePercentage = (current: number, limit: number) => {
    return limit > 0 ? Math.min((current / limit) * 100, 100) : 0;
  };

  const getRiskBadge = (risk: string) => {
    const colors = {
      'High Risk': 'bg-red-100 text-red-800',
      'Medium Risk': 'bg-yellow-100 text-yellow-800',
      'Low Risk': 'bg-green-100 text-green-800',
      'No Risk': 'bg-blue-100 text-blue-800'
    };
    return <Badge className={colors[risk as keyof typeof colors] || 'bg-gray-100 text-gray-800'}>{risk}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Payment Method Management</h2>
          <p className="text-gray-600">Configure payment methods for sales and purchase operations</p>
        </div>
        <Button onClick={() => setShowDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Payment Method
        </Button>
      </div>

      {/* Tab Selection */}
      <div className="flex gap-2">
        <Button
          variant={activeTab === 'sales' ? 'default' : 'outline'}
          onClick={() => setActiveTab('sales')}
        >
          Sales Payment Methods
        </Button>
        <Button
          variant={activeTab === 'purchase' ? 'default' : 'outline'}
          onClick={() => setActiveTab('purchase')}
        >
          Purchase Payment Methods
        </Button>
      </div>

      {/* Sales Payment Methods */}
      {activeTab === 'sales' && (
        <div className="grid gap-4">
          {salesLoading ? (
            <div className="text-center py-8">Loading sales payment methods...</div>
          ) : (
            salesPaymentMethods?.map((method) => (
              <Card key={method.id}>
                <CardContent className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      {method.type === 'UPI' ? (
                        <CreditCard className="h-8 w-8 text-blue-500" />
                      ) : (
                        <Building className="h-8 w-8 text-green-500" />
                      )}
                      <div>
                        <h3 className="font-semibold text-lg">
                          {method.type === 'UPI' ? method.upi_id : method.bank_accounts?.account_name}
                        </h3>
                        <p className="text-gray-600">
                          {method.type} • {method.frequency}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getRiskBadge(method.risk_category)}
                      <Badge variant={method.is_active ? "default" : "secondary"}>
                        {method.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </div>

                  {method.type === 'Bank Account' && method.bank_accounts && (
                    <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                      <div className="flex justify-between items-center">
                        <span className="font-medium">{method.bank_accounts.bank_name}</span>
                        <span className="text-green-600 font-semibold">
                          ₹{method.bank_accounts.balance.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Usage Limit</span>
                      <span>₹{method.current_usage.toLocaleString()} / ₹{method.payment_limit.toLocaleString()}</span>
                    </div>
                    <Progress value={getUsagePercentage(method.current_usage, method.payment_limit)} />
                    <div className="text-xs text-gray-500">
                      Available: ₹{(method.payment_limit - method.current_usage).toLocaleString()}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Purchase Payment Methods */}
      {activeTab === 'purchase' && (
        <div className="grid gap-4">
          {purchaseLoading ? (
            <div className="text-center py-8">Loading purchase payment methods...</div>
          ) : (
            purchasePaymentMethods?.map((method) => (
              <Card key={method.id}>
                <CardContent className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <Building className="h-8 w-8 text-green-500" />
                      <div>
                        <h3 className="font-semibold text-lg">
                          {method.bank_accounts?.account_name}
                        </h3>
                        <p className="text-gray-600">
                          Bank Account • {method.frequency}
                        </p>
                      </div>
                    </div>
                    <Badge variant={method.is_active ? "default" : "secondary"}>
                      {method.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>

                  {method.bank_accounts && (
                    <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                      <div className="flex justify-between items-center">
                        <span className="font-medium">{method.bank_accounts.bank_name}</span>
                        <span className="text-green-600 font-semibold">
                          ₹{method.bank_accounts.balance.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Usage Limit</span>
                      <span>₹{method.current_usage.toLocaleString()} / ₹{method.payment_limit.toLocaleString()}</span>
                    </div>
                    <Progress value={getUsagePercentage(method.current_usage, method.payment_limit)} />
                    <div className="text-xs text-gray-500">
                      Available: ₹{(method.payment_limit - method.current_usage).toLocaleString()}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Add/Edit Payment Method Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingMethod ? 'Edit' : 'Add'} {activeTab === 'sales' ? 'Sales' : 'Purchase'} Payment Method
            </DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {activeTab === 'sales' && (
              <div>
                <Label htmlFor="type">Payment Type *</Label>
                <Select onValueChange={(value) => setFormData(prev => ({ ...prev, type: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select payment type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UPI">UPI</SelectItem>
                    <SelectItem value="Bank Account">Bank Account</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {activeTab === 'sales' && formData.type === 'UPI' && (
              <div>
                <Label htmlFor="upi_id">UPI ID *</Label>
                <Input
                  id="upi_id"
                  value={formData.upi_id}
                  onChange={(e) => setFormData(prev => ({ ...prev, upi_id: e.target.value }))}
                  placeholder="example@paytm"
                  required
                />
              </div>
            )}

            {(activeTab === 'purchase' || formData.type === 'Bank Account') && (
              <div>
                <Label htmlFor="bank_account_id">Bank Account *</Label>
                <Select onValueChange={(value) => setFormData(prev => ({ ...prev, bank_account_id: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select bank account" />
                  </SelectTrigger>
                  <SelectContent>
                    {bankAccounts?.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        <div className="flex flex-col">
                          <span className="font-medium">{account.account_name}</span>
                          <span className="text-sm text-gray-500">
                            {account.bank_name} - {account.account_number} (₹{account.balance.toLocaleString()})
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {activeTab === 'sales' && (
              <div>
                <Label htmlFor="risk_category">Risk Category *</Label>
                <Select onValueChange={(value) => setFormData(prev => ({ ...prev, risk_category: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select risk category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="No Risk">No Risk</SelectItem>
                    <SelectItem value="Low Risk">Low Risk</SelectItem>
                    <SelectItem value="Medium Risk">Medium Risk</SelectItem>
                    <SelectItem value="High Risk">High Risk</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label htmlFor="payment_limit">Payment Limit (₹) *</Label>
              <Input
                id="payment_limit"
                type="number"
                min="0"
                step="0.01"
                value={formData.payment_limit}
                onChange={(e) => setFormData(prev => ({ ...prev, payment_limit: parseFloat(e.target.value) || 0 }))}
                required
              />
            </div>

            <div>
              <Label htmlFor="frequency">Frequency *</Label>
              <Select onValueChange={(value) => setFormData(prev => ({ ...prev, frequency: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select frequency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24 hours">24 hours</SelectItem>
                  <SelectItem value="Daily">Daily</SelectItem>
                  <SelectItem value="48 hours">48 hours</SelectItem>
                  <SelectItem value="Custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.frequency === 'Custom' && (
              <div>
                <Label htmlFor="custom_frequency">Custom Frequency</Label>
                <Input
                  id="custom_frequency"
                  value={formData.custom_frequency}
                  onChange={(e) => setFormData(prev => ({ ...prev, custom_frequency: e.target.value }))}
                  placeholder="e.g., 72 hours, Weekly"
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {editingMethod ? 'Update' : 'Create'} Payment Method
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
