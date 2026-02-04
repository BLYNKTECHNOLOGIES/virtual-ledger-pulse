
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Plus, Edit, Smartphone, Building, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ViewOnlyWrapper } from "@/components/ui/view-only-wrapper";
import { usePermissions } from "@/hooks/usePermissions";
import { PermissionGate } from "@/components/PermissionGate";

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
  payment_gateway: boolean;
  settlement_cycle?: "Instant Settlement" | "T+1 Day" | "Custom";
  settlement_days?: number;
}

export function PaymentMethodManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();

  const LIMIT_MIN = 100;
  const LIMIT_MAX = 10000000;
  const normalizeLimit = (value: number) => {
    const v = Number.isFinite(value) ? value : LIMIT_MIN;
    return Math.min(1, Math.max(0, (v - LIMIT_MIN) / (LIMIT_MAX - LIMIT_MIN)));
  };
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingMethod, setEditingMethod] = useState<SalesPaymentMethod | null>(null);
  const [deletingMethod, setDeletingMethod] = useState<SalesPaymentMethod | null>(null);
  const [step, setStep] = useState(1);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    type: "UPI" as "UPI" | "Bank Account",
    upi_id: "",
    bank_account_id: "",
    risk_category: "Medium Risk" as "High Risk" | "Medium Risk" | "Low Risk" | "No Risk",
    payment_limit: "",
    minLimit: "100",
    maxLimit: "10000000",
    frequency: "" as "24 hours" | "Daily" | "48 hours" | "Custom" | "",
    custom_frequency: "",
    payment_gateway: false,
    settlement_cycle: "" as "Instant Settlement" | "T+1 Day" | "Custom" | "",
    settlement_days: ""
  });

  const getProgressColor = (progress: number) => {
    if (progress < 0.3) return "#10b981"; // Green
    if (progress < 0.6) return "#f59e0b"; // Yellow
    if (progress < 0.8) return "#f97316"; // Orange
    return "#dc2626"; // Red
  };

  // Fetch sales payment methods
  const { data: paymentMethods, isLoading: isLoadingPaymentMethods } = useQuery({
    queryKey: ['sales_payment_methods'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_payment_methods')
        .select(`
          *,
          bank_accounts!bank_account_id (
            account_name,
            bank_name,
            account_number,
            status
          )
        `)
        .eq('is_active', true)  // Only fetch active payment methods
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as SalesPaymentMethod[];
    },
  });

  // Fetch active bank accounts for dropdown (excluding dormant)
  const { data: bankAccounts, isLoading: isLoadingBankAccounts } = useQuery({
    queryKey: ['active_bank_accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('id, account_name, bank_name, account_number, IFSC')
        .eq('status', 'ACTIVE')
        .is('dormant_at', null) // Exclude dormant accounts
        .order('account_name');
      
      if (error) throw error;
      return data;
    },
  });

  // Create payment method mutation
  const createMethodMutation = useMutation({
    mutationFn: async (methodData: typeof formData) => {
      setSubmitError(null);
      // Validate that bank account is selected
      if (!methodData.bank_account_id) {
        throw new Error("Bank account selection is required for all payment methods");
      }

      const { data, error } = await supabase
        .from('sales_payment_methods')
        .insert({
          type: methodData.type,
          upi_id: methodData.type === "UPI" ? methodData.upi_id : null,
          bank_account_id: methodData.bank_account_id, // Always required now
          risk_category: methodData.risk_category,
          payment_limit: parseFloat(methodData.payment_limit) || 0,
          min_limit: Math.max(LIMIT_MIN, parseFloat(methodData.minLimit) || LIMIT_MIN),
          max_limit: parseFloat(methodData.maxLimit) || LIMIT_MAX,
          frequency: methodData.frequency,
          custom_frequency: methodData.frequency === "Custom" ? methodData.custom_frequency : null,
          beneficiaries_per_24h: null,
          payment_gateway: methodData.payment_gateway,
          settlement_cycle: methodData.payment_gateway ? methodData.settlement_cycle : null,
          settlement_days: methodData.payment_gateway && methodData.settlement_cycle === "Custom" ? parseInt(methodData.settlement_days) : null,
          is_active: true,
          last_reset: new Date().toISOString()
        })
        .select('id')
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      toast({
        title: "Payment Method Created",
        description: "New payment method has been successfully added and linked to bank account.",
      });
      await queryClient.invalidateQueries({ queryKey: ['sales_payment_methods'] });
      await queryClient.refetchQueries({ queryKey: ['sales_payment_methods'] });
      resetForm();
      setIsAddDialogOpen(false);
    },
    onError: (error: any) => {
      const details = [error?.message, error?.details, error?.hint].filter(Boolean).join("\n");
      setSubmitError(details || "Failed to create payment method");
      // Handle specific constraint violation for bank account uniqueness
      if (error.message?.includes('unique_sales_bank_account_transfer')) {
        toast({
          title: "Duplicate Payment Method",
          description: "This bank account already has a bank transfer payment method. Each bank account can only have one bank transfer method.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: details || "Failed to create payment method",
          variant: "destructive",
        });
      }
    },
  });

  // Update payment method mutation
  const updateMethodMutation = useMutation({
    mutationFn: async (methodData: typeof formData & { id: string }) => {
      setSubmitError(null);
      // Validate that bank account is selected
      if (!methodData.bank_account_id) {
        throw new Error("Bank account selection is required for all payment methods");
      }

      const { data, error } = await supabase
        .from('sales_payment_methods')
        .update({
          type: methodData.type,
          upi_id: methodData.type === "UPI" ? methodData.upi_id : null,
          bank_account_id: methodData.bank_account_id, // Always required now
          risk_category: methodData.risk_category,
          payment_limit: parseFloat(methodData.payment_limit) || 0,
          min_limit: Math.max(LIMIT_MIN, parseFloat(methodData.minLimit) || LIMIT_MIN),
          max_limit: parseFloat(methodData.maxLimit) || LIMIT_MAX,
          frequency: methodData.frequency,
          custom_frequency: methodData.frequency === "Custom" ? methodData.custom_frequency : null,
          beneficiaries_per_24h: null,
          payment_gateway: methodData.payment_gateway,
          settlement_cycle: methodData.payment_gateway ? methodData.settlement_cycle : null,
          settlement_days: methodData.payment_gateway && methodData.settlement_cycle === "Custom" ? parseInt(methodData.settlement_days) : null,
          is_active: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', methodData.id)
        .select('id')
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      toast({
        title: "Payment Method Updated",
        description: "Payment method has been successfully updated.",
      });
      await queryClient.invalidateQueries({ queryKey: ['sales_payment_methods'] });
      await queryClient.refetchQueries({ queryKey: ['sales_payment_methods'] });
      resetForm();
      setIsAddDialogOpen(false);
      setEditingMethod(null);
    },
    onError: (error: any) => {
      const details = [error?.message, error?.details, error?.hint].filter(Boolean).join("\n");
      setSubmitError(details || "Failed to update payment method");
      toast({
        title: "Error",
        description: details || "Failed to update payment method",
        variant: "destructive",
      });
    },
  });

  // Delete payment method mutation (soft delete by setting is_active to false)
  const deleteMethodMutation = useMutation({
    mutationFn: async (methodId: string) => {
      const { error } = await supabase
        .from('sales_payment_methods')
        .update({ is_active: false })
        .eq('id', methodId);

      if (error) throw error;
    },
    onSuccess: async () => {
      toast({
        title: "Payment Method Deleted",
        description: "Payment method has been successfully deleted.",
      });
      await queryClient.invalidateQueries({ queryKey: ['sales_payment_methods'] });
      setDeletingMethod(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to delete payment method.",
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
      queryClient.invalidateQueries({ queryKey: ['sales_payment_methods'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: "Failed to reset payment limits.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.preventDefault();
    console.log('=== PAYMENT METHOD FORM SUBMIT ===');
    console.log('Step:', step);
    console.log('Form data:', JSON.stringify(formData, null, 2));
    console.log('payment_gateway:', formData.payment_gateway);
    console.log('settlement_cycle:', formData.settlement_cycle);
    
    // Validate required fields
    if (!formData.bank_account_id) {
      toast({
        title: "Validation Error",
        description: "Please select a bank account.",
        variant: "destructive",
      });
      return;
    }

    if (formData.type === "UPI" && !formData.upi_id.trim()) {
      toast({
        title: "Validation Error",
        description: "Please enter a valid UPI ID.",
        variant: "destructive",
      });
      return;
    }

    const paymentLimit = Number(formData.payment_limit);
    if (!Number.isFinite(paymentLimit) || paymentLimit <= 0) {
      toast({
        title: "Validation Error",
        description: "Please enter a valid payment limit.",
        variant: "destructive",
      });
      return;
    }

    const minLimit = Number(formData.minLimit);
    const maxLimit = Number(formData.maxLimit);
    if (!Number.isFinite(minLimit) || minLimit < LIMIT_MIN) {
      toast({
        title: "Validation Error",
        description: `Minimum limit must be at least ₹${LIMIT_MIN.toLocaleString()}.`,
        variant: "destructive",
      });
      return;
    }
    if (!Number.isFinite(maxLimit) || maxLimit <= 0 || maxLimit < minLimit) {
      toast({
        title: "Validation Error",
        description: "Max limit must be greater than or equal to min limit.",
        variant: "destructive",
      });
      return;
    }
    
    if (!formData.frequency) {
      toast({
        title: "Validation Error", 
        description: "Please select a reset frequency.",
        variant: "destructive",
      });
      return;
    }

    if (formData.frequency === "Custom") {
      const customHours = Number(formData.custom_frequency);
      if (!Number.isFinite(customHours) || customHours <= 0) {
        toast({
          title: "Validation Error",
          description: "Please enter a valid custom frequency (hours).",
          variant: "destructive",
        });
        return;
      }
    }
    
    if (formData.payment_gateway && !formData.settlement_cycle) {
      toast({
        title: "Validation Error",
        description: "Please select a settlement cycle for payment gateway.",
        variant: "destructive",
      });
      return;
    }

    if (formData.payment_gateway && formData.settlement_cycle === "Custom") {
      const days = Number(formData.settlement_days);
      if (!Number.isFinite(days) || days <= 0) {
        toast({
          title: "Validation Error",
          description: "Please enter valid settlement days (T+n).",
          variant: "destructive",
        });
        return;
      }
    }
    
    // Skip validation for editing - just submit
    if (editingMethod) {
      console.log('Updating existing sales method');
      updateMethodMutation.mutate({ ...formData, id: editingMethod.id });
    } else {
      console.log('Creating new sales method');
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
      minLimit: (method as any).min_limit?.toString() || "100",
      maxLimit: (method as any).max_limit?.toString() || "10000000",
      frequency: method.frequency,
      custom_frequency: method.custom_frequency || "",
      
      payment_gateway: method.payment_gateway || false,
      settlement_cycle: method.settlement_cycle || "",
      settlement_days: method.settlement_days?.toString() || ""
    });
    setStep(1); // Reset to first step when editing
    setIsAddDialogOpen(true);
  };

  const resetForm = () => {
    setSubmitError(null);
    setFormData({
      type: "UPI",
      upi_id: "",
      bank_account_id: "",
      risk_category: "Medium Risk",
      payment_limit: "",
      minLimit: "100",
      maxLimit: "10000000",
      frequency: "" as any, // Start empty
      custom_frequency: "",
      
      payment_gateway: false,
      settlement_cycle: "",
      settlement_days: ""
    });
    setEditingMethod(null);
    setStep(1);
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

  // Check permissions
  const hasManagePermission = hasPermission('bams_manage');
  const isViewOnly = !hasManagePermission;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Sales Payment Methods</h2>
          <p className="text-gray-600">Manage UPI and bank account payment methods with risk categories for sales. All methods must be linked to a bank account.</p>
        </div>
        <ViewOnlyWrapper isViewOnly={isViewOnly}>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => resetLimitsMutation.mutate()}
              disabled={resetLimitsMutation.isPending}
              className="flex items-center gap-2"
            >
              {resetLimitsMutation.isPending ? "Resetting..." : "Reset All Limits"}
            </Button>
          </div>
        </ViewOnlyWrapper>
      </div>
      <ViewOnlyWrapper isViewOnly={isViewOnly}>
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
                Add Payment Method
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {editingMethod ? "Edit Sales Payment Method" : "Add New Sales Payment Method"}
                <span className="text-sm text-gray-500">Step {step} of {formData.payment_gateway ? 4 : 3}</span>
              </DialogTitle>
            </DialogHeader>
            
            <div className="flex justify-center mb-6">
              <div className="flex items-center space-x-4">
                {Array.from({ length: formData.payment_gateway ? 4 : 3 }, (_, i) => i + 1).map((stepNum) => (
                  <div key={stepNum} className="flex items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                      stepNum <= step ? 'bg-blue-600 text-white' : 
                      'bg-gray-200 text-gray-500'
                    } ${stepNum === step ? 'ring-2 ring-blue-300' : ''}`}>
                      {stepNum < step ? '✓' : stepNum}
                    </div>
                    {stepNum < (formData.payment_gateway ? 4 : 3) && <div className={`w-12 h-0.5 ${stepNum <= step ? 'bg-blue-600' : 'bg-gray-200'}`} />}
                  </div>
                ))}
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {submitError && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive whitespace-pre-line">
                  {submitError}
                </div>
              )}
              {step === 1 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Basic Information</h3>
                  
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
                    <div>
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
                      min="200"
                      max="10000000"
                      step="0.01"
                      value={formData.payment_limit}
                      onChange={(e) => setFormData(prev => ({ ...prev, payment_limit: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="payment_gateway"
                      checked={formData.payment_gateway}
                      onChange={(e) => setFormData(prev => ({ 
                        ...prev, 
                        payment_gateway: e.target.checked,
                        settlement_cycle: e.target.checked ? prev.settlement_cycle : "",
                        settlement_days: e.target.checked ? prev.settlement_days : ""
                      }))}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <Label htmlFor="payment_gateway" className="text-sm font-medium text-gray-700">
                      Payment Gateway
                    </Label>
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
                              stroke={getProgressColor(normalizeLimit(parseInt(formData.minLimit || `${LIMIT_MIN}`)))}
                              strokeWidth="3"
                              strokeDasharray={`${normalizeLimit(parseInt(formData.minLimit || `${LIMIT_MIN}`)) * 100}, 100`}
                            />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-xs font-medium text-center">
                              ₹{parseInt(formData.minLimit || `${LIMIT_MIN}`).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                      <Slider
                        value={[parseInt(formData.minLimit || `${LIMIT_MIN}`)]}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, minLimit: value[0].toString() }))}
                        min={LIMIT_MIN}
                        max={LIMIT_MAX}
                        step={1000}
                        className="w-full"
                      />
                      <Input
                        type="number"
                        min={String(LIMIT_MIN)}
                        max={String(LIMIT_MAX)}
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
                              stroke={getProgressColor(normalizeLimit(parseInt(formData.maxLimit || `${LIMIT_MAX}`)))}
                              strokeWidth="3"
                              strokeDasharray={`${normalizeLimit(parseInt(formData.maxLimit || `${LIMIT_MAX}`)) * 100}, 100`}
                            />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-xs font-medium text-center">
                              ₹{parseInt(formData.maxLimit || `${LIMIT_MAX}`).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                      <Slider
                        value={[parseInt(formData.maxLimit || `${LIMIT_MAX}`)]}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, maxLimit: value[0].toString() }))}
                        min={LIMIT_MIN}
                        max={LIMIT_MAX}
                        step={1000}
                        className="w-full"
                      />
                      <Input
                        type="number"
                        min={String(LIMIT_MIN)}
                        max={String(LIMIT_MAX)}
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
                      onValueChange={(value: "24 hours" | "Daily" | "48 hours" | "Custom") => {
                        setFormData(prev => ({ ...prev, frequency: value }));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select frequency" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="24 hours">24 Hours (Rolling)</SelectItem>
                        <SelectItem value="Daily">Daily (Calendar Day)</SelectItem>
                        <SelectItem value="48 hours">48 Hours</SelectItem>
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


                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="text-sm text-blue-800">
                      <strong>Important:</strong> All sales transactions through this payment method will be automatically credited to the selected bank account. This ensures proper financial tracking and reconciliation.
                    </p>
                  </div>
                </div>
              )}

              {step === 4 && formData.payment_gateway && (
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Settlement Cycle Configuration</h3>
                  <p className="text-sm text-gray-600">Configure how quickly funds are settled to your bank account</p>
                  
                  <div>
                    <Label htmlFor="settlement_cycle">Settlement Cycle *</Label>
                    <Select 
                      value={formData.settlement_cycle} 
                      onValueChange={(value: "Instant Settlement" | "T+1 Day" | "Custom") => {
                        setFormData(prev => ({ ...prev, settlement_cycle: value }));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select settlement cycle" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Instant Settlement">Instant Settlement</SelectItem>
                        <SelectItem value="T+1 Day">T+1 Day</SelectItem>
                        <SelectItem value="Custom">Custom (T+n)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500 mt-1">
                      Instant: Funds available immediately | T+1: Next business day | Custom: Specify number of days
                    </p>
                  </div>

                  {formData.settlement_cycle === "Custom" && (
                    <div>
                      <Label htmlFor="settlement_days">Settlement Days (T+n) *</Label>
                      <Input
                        id="settlement_days"
                        type="number"
                        min="1"
                        max="30"
                        placeholder="Enter number of days (e.g., 2 for T+2)"
                        value={formData.settlement_days}
                        onChange={(e) => setFormData(prev => ({ ...prev, settlement_days: e.target.value }))}
                        required={formData.settlement_cycle === "Custom"}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Enter the number of days after transaction for settlement (e.g., 2 for T+2, 7 for T+7)
                      </p>
                    </div>
                  )}

                  <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
                    <h4 className="text-sm font-semibold text-blue-800 mb-2">Settlement Cycle Examples</h4>
                    <div className="text-xs text-blue-700 space-y-1">
                      <div><strong>Instant Settlement:</strong> Funds available immediately in your account</div>
                      <div><strong>T+1 Day:</strong> Funds available next business day</div>
                      <div><strong>T+2 Days:</strong> Funds available in 2 business days</div>
                      <div><strong>T+7 Days:</strong> Funds available in 1 week</div>
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
                
                {step < (formData.payment_gateway ? 4 : 3) ? (
                  <Button type="button" onClick={() => setStep(step + 1)}>
                    Next
                  </Button>
                ) : (
                  <Button 
                    type="submit"
                    onClick={(e) => {
                      console.log('=== ADD METHOD BUTTON CLICKED ===');
                      // If form onSubmit doesn't fire, call handleSubmit directly
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
      </ViewOnlyWrapper>

      <Card>
        <CardHeader>
          <CardTitle>Sales Payment Methods</CardTitle>
        </CardHeader>
        <CardContent>
          {(isLoadingPaymentMethods || isLoadingBankAccounts) ? (
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
                      {isLoadingBankAccounts ? (
                        <div className="text-sm text-gray-500">Loading...</div>
                      ) : method.bank_accounts ? (
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
                      <PermissionGate permissions={["bams_manage"]} showFallback={false}>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(method)}
                            className="flex items-center gap-1"
                          >
                            <Edit className="h-3 w-3" />
                            Edit
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setDeletingMethod(method)}
                            className="flex items-center gap-1"
                          >
                            <Trash2 className="h-3 w-3" />
                            Delete
                          </Button>
                        </div>
                      </PermissionGate>
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingMethod} onOpenChange={(open) => !open && setDeletingMethod(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Payment Method</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this payment method?
              {deletingMethod && (
                <div className="mt-2 p-3 bg-gray-50 rounded-lg">
                  <p className="font-medium">
                    {deletingMethod.type === "UPI" ? deletingMethod.upi_id : "Bank Transfer"}
                  </p>
                  {deletingMethod.bank_accounts && (
                    <p className="text-sm text-gray-500">
                      Linked to: {deletingMethod.bank_accounts.account_name}
                    </p>
                  )}
                </div>
              )}
              <p className="mt-2 text-amber-600 text-sm">
                This action will deactivate the payment method. Historical transactions will be preserved.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingMethod && deleteMethodMutation.mutate(deletingMethod.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMethodMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
