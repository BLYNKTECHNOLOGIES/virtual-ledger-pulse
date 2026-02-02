import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Edit, Smartphone, Building, TrendingDown, AlertTriangle, Trash2, Wallet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PermissionGate } from "@/components/PermissionGate";
import { usePermissions } from "@/hooks/usePermissions";
import { BankBalanceFilterWidget } from "@/components/widgets/BankBalanceFilterWidget";

interface PurchaseMethod {
  id: string;
  type: "UPI" | "Bank Transfer";
  name: string;
  paymentLimit: number;
  minLimit: number;
  maxLimit: number;
  frequency: "24 hours" | "Daily";
  currentUsage: number;
  lastReset: string;
  isActive: boolean;
  safeFund: boolean;
  bankAccountName?: string;
  beneficiariesPer24h?: number;
}

interface BankAccount {
  id: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  IFSC: string;
  balance: number;
}

export function PurchaseManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const [purchaseMethods, setPurchaseMethods] = useState<PurchaseMethod[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingMethod, setEditingMethod] = useState<PurchaseMethod | null>(null);
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    type: "UPI" as "UPI" | "Bank Transfer",
    name: "",
    paymentLimit: "",
    minLimit: "200",
    maxLimit: "10000000",
    frequency: "" as "24 hours" | "Daily" | "Custom" | "",
    custom_frequency: "",
    bankAccountName: "",
    safeFund: false,
    beneficiariesPer24h: ""
  });

  const getProgressColor = (progress: number) => {
    if (progress < 0.3) return "#10b981"; // Green
    if (progress < 0.6) return "#f59e0b"; // Yellow
    if (progress < 0.8) return "#f97316"; // Orange
    return "#dc2626"; // Red
  };

  // Create purchase method mutation
  const createMethodMutation = useMutation({
    mutationFn: async (methodData: typeof formData) => {
      const { error } = await supabase
        .from('purchase_payment_methods')
        .insert({
          type: methodData.type,
          payment_limit: parseFloat(methodData.paymentLimit),
          min_limit: parseFloat(methodData.minLimit),
          max_limit: parseFloat(methodData.maxLimit),
          frequency: methodData.frequency,
          custom_frequency: methodData.frequency === "Custom" ? methodData.custom_frequency : null,
          bank_account_name: methodData.bankAccountName || null,
          safe_fund: methodData.safeFund,
          beneficiaries_per_24h: methodData.type === "Bank Transfer" ? parseInt(methodData.beneficiariesPer24h || "5") : null,
          safe_funds: methodData.safeFund,
          current_usage: 0,
          is_active: true,
          last_reset: new Date().toISOString()
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Purchase Method Added",
        description: "New purchase method has been successfully added.",
      });
      queryClient.invalidateQueries({ queryKey: ['purchase_payment_methods'] });
      resetForm();
      setIsAddDialogOpen(false);
    },
    onError: (error: any) => {
      if (error.message?.includes('unique_purchase_bank_transfer')) {
        toast({
          title: "Duplicate Payment Method",
          description: "This bank account already has a bank transfer payment method. Each bank account can only have one bank transfer method.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: error.message || "Failed to create purchase method",
          variant: "destructive",
        });
      }
    },
  });

  // Update purchase method mutation
  const updateMethodMutation = useMutation({
    mutationFn: async (methodData: typeof formData & { id: string }) => {
      const { error } = await supabase
        .from('purchase_payment_methods')
        .update({
          type: methodData.type,
          payment_limit: parseFloat(methodData.paymentLimit),
          min_limit: parseFloat(methodData.minLimit),
          max_limit: parseFloat(methodData.maxLimit),
          frequency: methodData.frequency,
          custom_frequency: methodData.frequency === "Custom" ? methodData.custom_frequency : null,
          bank_account_name: methodData.bankAccountName || null,
          safe_fund: methodData.safeFund,
          beneficiaries_per_24h: methodData.type === "Bank Transfer" ? parseInt(methodData.beneficiariesPer24h || "5") : null,
          updated_at: new Date().toISOString()
        })
        .eq('id', methodData.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Purchase Method Updated",
        description: "The purchase method has been successfully updated.",
      });
      queryClient.invalidateQueries({ queryKey: ['purchase_payment_methods'] });
      resetForm();
      setIsAddDialogOpen(false);
      setEditingMethod(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update purchase method",
        variant: "destructive",
      });
    },
  });

  // Reset payment limits mutation
  const resetLimitsMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke('reset-payment-limits');
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Payment Limits Reset",
        description: "All payment limits have been reset based on their frequency settings.",
      });
      queryClient.invalidateQueries({ queryKey: ['purchase_payment_methods'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",  
        description: "Failed to reset payment limits.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Form submission on step:', step);
    console.log('Form data:', formData);
    
    // Skip validation for editing - just submit
    if (editingMethod) {
      console.log('Updating existing method');
      updateMethodMutation.mutate({ ...formData, id: editingMethod.id });
    } else {
      console.log('Creating new method');
      createMethodMutation.mutate(formData);
    }
  };

  // Fetch purchase methods from Supabase with real-time updates
  useEffect(() => {
    const fetchPurchaseMethods = async () => {
      const { data, error } = await supabase
        .from('purchase_payment_methods')
        .select(`
          *,
          bank_accounts!purchase_payment_methods_bank_account_name_fkey(status)
        `)
        .eq('is_active', true)  // Only fetch active payment methods
        .order('created_at');

      if (error) {
        console.error('Error fetching purchase methods:', error);
        toast({
          title: "Error",
          description: "Failed to fetch purchase methods.",
          variant: "destructive",
        });
      } else {
        const formattedMethods = (data || []).map(method => ({
          id: method.id,
          type: (method.type === 'UPI' ? 'UPI' : 'Bank Transfer') as "UPI" | "Bank Transfer",
          name: method.bank_account_name || 'Unnamed Method',
          paymentLimit: method.payment_limit,
          minLimit: method.min_limit || 0,
          maxLimit: method.max_limit || 0,
          frequency: method.frequency as "24 hours" | "Daily",
          currentUsage: method.current_usage || 0,
          lastReset: method.last_reset || new Date().toISOString(),
          isActive: method.is_active,
          safeFund: method.safe_fund || false,
          bankAccountName: method.bank_account_name,
          beneficiariesPer24h: method.beneficiaries_per_24h || 5
        }));
        setPurchaseMethods(formattedMethods);
      }
    };

    fetchPurchaseMethods();

    // Set up real-time subscription for purchase payment methods
    const subscription = supabase
      .channel('purchase_payment_methods_changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'purchase_payment_methods' }, 
        () => {
          fetchPurchaseMethods();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [toast]);

  // Fetch bank accounts from Supabase
  useEffect(() => {
    const fetchBankAccounts = async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('id, bank_name, account_name, account_number, IFSC, balance')
        .eq('status', 'ACTIVE');

      if (error) {
        console.error('Error fetching bank accounts:', error);
        toast({
          title: "Error",
          description: "Failed to fetch bank accounts.",
          variant: "destructive",
        });
      } else {
        setBankAccounts(data || []);
      }
    };

    fetchBankAccounts();
  }, [toast]);

  const handleEdit = (method: PurchaseMethod) => {
    setEditingMethod(method);
    setFormData({
      type: method.type,
      name: method.name,
      paymentLimit: method.paymentLimit.toString(),
      minLimit: method.minLimit.toString(),
      maxLimit: method.maxLimit.toString(),
      frequency: method.frequency,
      custom_frequency: "",
      bankAccountName: method.bankAccountName || "",
      safeFund: method.safeFund,
      beneficiariesPer24h: method.beneficiariesPer24h?.toString() || "5"
    });
    setStep(1); // Reset to first step when editing
    setIsAddDialogOpen(true);
  };

  const handleDelete = async (methodId: string) => {
    try {
      const { error } = await supabase
        .from('purchase_payment_methods')
        .delete()
        .eq('id', methodId);

      if (error) throw error;

      // Remove from local state
      setPurchaseMethods(prev => prev.filter(method => method.id !== methodId));
      
      toast({
        title: "Purchase Method Deleted",
        description: "The purchase method has been successfully deleted.",
      });
    } catch (error) {
      console.error('Error deleting purchase method:', error);
      toast({
        title: "Error",
        description: "Failed to delete purchase method.",
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setFormData({
      type: "UPI",
      name: "",
      paymentLimit: "",
      minLimit: "200",
      maxLimit: "10000000",
      frequency: "" as any, // Start empty
      custom_frequency: "",
      bankAccountName: "",
      safeFund: false,
      beneficiariesPer24h: "" // Start empty
    });
    setEditingMethod(null);
    setStep(1);
  };

  const getAvailableLimit = (method: PurchaseMethod) => {
    return method.paymentLimit - method.currentUsage;
  };

  const getUsagePercentage = (method: PurchaseMethod) => {
    return (method.currentUsage / method.paymentLimit) * 100;
  };

  const getTotalAvailableUPI = () => {
    return purchaseMethods
      .filter(m => m.type === "UPI" && m.isActive)
      .reduce((sum, m) => sum + getAvailableLimit(m), 0);
  };

  const getTotalAvailableBankTransfer = () => {
    return purchaseMethods
      .filter(m => m.type === "Bank Transfer" && m.isActive)
      .reduce((sum, m) => sum + getAvailableLimit(m), 0);
  };

  const getTotalBankBalance = () => {
    // Get unique bank account names from active purchase methods
    const uniqueAccountNames = new Set(
      purchaseMethods
        .filter(m => m.isActive && m.bankAccountName)
        .map(m => m.bankAccountName)
    );

    // Sum balances of unique bank accounts
    return bankAccounts
      .filter(account => uniqueAccountNames.has(account.account_name))
      .reduce((sum, account) => sum + account.balance, 0);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Purchase Management</h2>
          <p className="text-gray-600">Manage payment methods for company purchases</p>
        </div>
        <PermissionGate permissions={["bams_manage"]} showFallback={false}>
          <div className="flex gap-2">
            <Button 
              onClick={() => resetLimitsMutation.mutate()}
              disabled={resetLimitsMutation.isPending}
              className="flex items-center gap-2"
            >
              {resetLimitsMutation.isPending ? "Resetting..." : "Reset Limits"}
            </Button>
          </div>
        </PermissionGate>
      </div>
      
      <PermissionGate permissions={["bams_manage"]} showFallback={false}>
        <div>
          <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
          setIsAddDialogOpen(open);
          if (!open) {
            resetForm();
          } else {
            setStep(1); // Always start at step 1 when opening
          }
        }}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Add Purchase Method
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {editingMethod ? "Edit Purchase Method" : "Add New Purchase Method"}
                <span className="text-sm text-gray-500">Step {step} of 3</span>
              </DialogTitle>
            </DialogHeader>
            
            <div className="flex justify-center mb-6">
              <div className="flex items-center space-x-4">
                {[1, 2, 3].map((stepNum) => (
                  <div key={stepNum} className="flex items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                      stepNum <= step ? 'bg-blue-600 text-white' : 
                      'bg-gray-200 text-gray-500'
                    } ${stepNum === step ? 'ring-2 ring-blue-300' : ''}`}>
                      {stepNum < step ? '✓' : stepNum}
                    </div>
                    {stepNum < 3 && <div className={`w-12 h-0.5 ${stepNum <= step ? 'bg-blue-600' : 'bg-gray-200'}`} />}
                  </div>
                ))}
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {step === 1 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Basic Information</h3>
                  
                  <div>
                    <Label htmlFor="type">Payment Method Type</Label>
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
                    <Label htmlFor="bankAccount">Link Bank Account</Label>
                    <Select value={formData.bankAccountName} onValueChange={(value) => 
                      setFormData(prev => ({ ...prev, bankAccountName: value }))
                    }>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a bank account" />
                      </SelectTrigger>
                      <SelectContent>
                        {bankAccounts.map((account) => (
                          <SelectItem key={account.id} value={account.account_name}>
                            {account.bank_name} - {account.account_name} ({account.account_number})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="paymentLimit">Payment Limit (₹)</Label>
                    <Input
                      id="paymentLimit"
                      type="number"
                      value={formData.paymentLimit}
                      onChange={(e) => setFormData(prev => ({ ...prev, paymentLimit: e.target.value }))}
                      required
                    />
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Payment Limits</h3>
                  
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Minimum Limit</Label>
                      <div className="flex items-center justify-center">
                        <div className="relative w-24 h-24">
                          <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 36 36">
                            <path
                              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                              fill="none"
                              stroke="#e2e8f0"
                              strokeWidth="3"
                            />
                            <path
                              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                              fill="none"
                              stroke={getProgressColor((parseInt(formData.minLimit) - 200) / (10000000 - 200))}
                              strokeWidth="3"
                              strokeDasharray={`${((parseInt(formData.minLimit) - 200) / (10000000 - 200)) * 100}, 100`}
                            />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-xs font-medium text-center">
                              ₹{parseInt(formData.minLimit || "200").toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                      <Slider
                        value={[parseInt(formData.minLimit || "200")]}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, minLimit: value[0].toString() }))}
                        min={200}
                        max={10000000}
                        step={1000}
                        className="w-full"
                      />
                      <Input
                        type="number"
                        min="200"
                        max="10000000"
                        value={formData.minLimit}
                        onChange={(e) => setFormData(prev => ({ ...prev, minLimit: e.target.value }))}
                        className="text-center text-sm"
                        placeholder="Manual input"
                      />
                    </div>
                    
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Maximum Limit</Label>
                      <div className="flex items-center justify-center">
                        <div className="relative w-24 h-24">
                          <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 36 36">
                            <path
                              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                              fill="none"
                              stroke="#e2e8f0"
                              strokeWidth="3"
                            />
                            <path
                              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                              fill="none"
                              stroke={getProgressColor((parseInt(formData.maxLimit) - 200) / (10000000 - 200))}
                              strokeWidth="3"
                              strokeDasharray={`${((parseInt(formData.maxLimit) - 200) / (10000000 - 200)) * 100}, 100`}
                            />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-xs font-medium text-center">
                              ₹{parseInt(formData.maxLimit || "10000000").toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                      <Slider
                        value={[parseInt(formData.maxLimit || "10000000")]}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, maxLimit: value[0].toString() }))}
                        min={200}
                        max={10000000}
                        step={1000}
                        className="w-full"
                      />
                      <Input
                        type="number"
                        min="200"
                        max="10000000"
                        value={formData.maxLimit}
                        onChange={(e) => setFormData(prev => ({ ...prev, maxLimit: e.target.value }))}
                        className="text-center text-sm"
                        placeholder="Manual input"
                      />
                    </div>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Additional Settings</h3>
                  
                  <div>
                    <Label htmlFor="frequency">Reset Frequency *</Label>
                    <Select 
                      value={formData.frequency} 
                      onValueChange={(value: "24 hours" | "Daily" | "Custom") => {
                        setFormData(prev => ({ ...prev, frequency: value }));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select frequency" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="24 hours">24 Hours (Rolling)</SelectItem>
                        <SelectItem value="Daily">Daily (Calendar Day)</SelectItem>
                        <SelectItem value="Custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500 mt-1">
                      24 hours: Limit resets 24 hours after each transaction | Daily: Resets at midnight
                    </p>
                  </div>

                  {formData.frequency === "Custom" && (
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="custom_frequency">Custom Frequency (Hours) *</Label>
                        <div className="flex items-center space-x-4">
                          <Input
                            id="custom_frequency"
                            type="number"
                            min="1"
                            placeholder="Enter hours (e.g., 12, 72)"
                            value={formData.custom_frequency}
                            onChange={(e) => setFormData(prev => ({ ...prev, custom_frequency: e.target.value }))}
                            className="flex-1"
                            required={formData.frequency === "Custom"}
                          />
                          <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                            <p className="text-sm text-blue-700 font-medium">
                              Hours Guide
                            </p>
                            <div className="text-xs text-blue-600 space-y-1 mt-1">
                              <div>• 12 hours = Twice daily</div>
                              <div>• 72 hours = Every 3 days</div>
                              <div>• 168 hours = Weekly</div>
                            </div>
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          Set how many hours after which the payment limit will reset
                        </p>
                      </div>
                    </div>
                  )}

                  {formData.type === "Bank Transfer" && (
                    <div>
                      <Label htmlFor="beneficiariesPer24h">Beneficiaries per 24 Hours *</Label>
                      <Input
                        id="beneficiariesPer24h"
                        type="number"
                        min="1"
                        max="100"
                        value={formData.beneficiariesPer24h}
                        onChange={(e) => setFormData(prev => ({ ...prev, beneficiariesPer24h: e.target.value }))}
                        required
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Maximum number of unique beneficiaries allowed per 24 hours
                      </p>
                    </div>
                  )}

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="safeFund"
                      checked={formData.safeFund}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, safeFund: checked === true }))}
                    />
                    <Label htmlFor="safeFund">Safe Fund</Label>
                    <div className="text-xs text-gray-500 ml-2">
                      Mark as safe funds for secure transactions
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-between">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => step > 1 ? setStep(step - 1) : setIsAddDialogOpen(false)}
                >
                  {step > 1 ? "Previous" : "Cancel"}
                </Button>
                
                {step < 3 ? (
                  <Button type="button" onClick={() => setStep(step + 1)}>
                    Next
                  </Button>
                ) : (
                  <Button 
                    type="button" 
                    onClick={(e) => {
                      e.preventDefault();
                      console.log('Submit button clicked on step:', step);
                      handleSubmit(e);
                    }}
                    disabled={createMethodMutation.isPending || updateMethodMutation.isPending}
                  >
                    {createMethodMutation.isPending || updateMethodMutation.isPending ? 
                      "Processing..." : 
                      (editingMethod ? "Update Method" : "Add Method")
                    }
                  </Button>
                )}
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      </PermissionGate>

      {/* Available Limits Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
              {purchaseMethods.filter(m => m.type === "UPI" && m.isActive).length} active UPI methods
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
              {purchaseMethods.filter(m => m.type === "Bank Transfer" && m.isActive).length} active bank accounts
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

        {/* Bank Balance Filter Widget */}
        <BankBalanceFilterWidget compact />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Purchase Payment Methods</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Linked Account</TableHead>
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
              {purchaseMethods.map((method) => {
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
                      {method.bankAccountName ? (
                        <span className="text-sm text-gray-600">{method.bankAccountName}</span>
                      ) : (
                        <span className="text-sm text-gray-400">Not linked</span>
                      )}
                    </TableCell>
                    <TableCell>₹{method.paymentLimit.toLocaleString()}</TableCell>
                    <TableCell>₹{method.currentUsage.toLocaleString()}</TableCell>
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
                    <TableCell>{method.frequency}</TableCell>
                    <TableCell>
                      <Badge variant={method.isActive ? "default" : "secondary"}>
                        {method.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <PermissionGate permissions={["bams_manage"]} showFallback={false}>
                        <div className="flex items-center gap-2">
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
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </PermissionGate>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}