import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Copy, ArrowLeft, ArrowRight } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface StepBySalesFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: 'normal' | 'alternative-same-type' | 'alternative-change-type';
  alternativeOrderData?: any;
  selectedAlternativeMethod?: any;
}

export function StepBySalesFlow({ 
  open, 
  onOpenChange, 
  mode = 'normal', 
  alternativeOrderData,
  selectedAlternativeMethod 
}: StepBySalesFlowProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Determine initial step based on mode
  const getInitialStep = () => {
    if (mode === 'alternative-same-type') return 4;
    if (mode === 'alternative-change-type') return 3;
    return 1;
  };

  const [currentStep, setCurrentStep] = useState(getInitialStep());
  const [formData, setFormData] = useState({
    clientName: '',
    clientPhone: '',
    platform: '',
    totalAmount: '',
    orderDate: new Date(),
    description: '',
    productId: '',
    quantity: 1,
    pricePerUnit: '',
    riskLevel: 'LOW'
  });
  
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<any>(null);

  // Reset form and step when dialog opens/closes or mode changes
  useEffect(() => {
    if (open) {
      setCurrentStep(getInitialStep());
      if (mode === 'alternative-same-type' && selectedAlternativeMethod) {
        setSelectedPaymentMethod(selectedAlternativeMethod);
        // Pre-fill form data with order information
        if (alternativeOrderData?.order) {
          setFormData(prev => ({
            ...prev,
            clientName: alternativeOrderData.order.client_name,
            clientPhone: alternativeOrderData.order.client_phone,
            platform: alternativeOrderData.order.platform,
            totalAmount: alternativeOrderData.order.total_amount,
            orderDate: alternativeOrderData.order.order_date,
            description: alternativeOrderData.order.description,
            riskLevel: alternativeOrderData.order.risk_level
          }));
        }
      } else if (mode === 'normal') {
        // Reset for normal mode
        setFormData({
          clientName: '',
          clientPhone: '',
          platform: '',
          totalAmount: '',
          orderDate: new Date(),
          description: '',
          productId: '',
          quantity: 1,
          pricePerUnit: '',
          riskLevel: 'LOW'
        });
        setSelectedPaymentMethod(null);
      }
    }
  }, [open, mode, selectedAlternativeMethod, alternativeOrderData]);

  // Fetch products for dropdown
  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch payment methods for dropdown
  const { data: paymentMethods } = useQuery({
    queryKey: ['sales_payment_methods'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_payment_methods')
        .select('*, bank_accounts:bank_account_id(account_name, bank_name, account_number, IFSC, bank_account_holder_name)')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Create sales order mutation
  const createSalesOrderMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPaymentMethod) {
        throw new Error('Please select a payment method');
      }

      // Start a transaction to revert all changes
      const { data: order, error: orderError } = await supabase
        .from('sales_orders')
        .insert({
          client_name: formData.clientName,
          client_phone: formData.clientPhone,
          platform: formData.platform,
          total_amount: parseFloat(formData.totalAmount),
          order_date: formData.orderDate,
          description: formData.description,
          product_id: formData.productId || null,
          quantity: formData.quantity || 1,
          price_per_unit: formData.pricePerUnit ? parseFloat(formData.pricePerUnit) : parseFloat(formData.totalAmount),
          sales_payment_method_id: selectedPaymentMethod.id,
          status: 'AWAITING_PAYMENT',
          payment_status: 'PENDING',
          risk_level: formData.riskLevel
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Update payment method usage
      await supabase
        .from('sales_payment_methods')
        .update({
          current_usage: (selectedPaymentMethod.current_usage || 0) + parseFloat(formData.totalAmount),
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedPaymentMethod.id);

      // Update product stock if product is linked
      if (formData.productId) {
        const { data: product } = await supabase
          .from('products')
          .select('current_stock_quantity, total_sales')
          .eq('id', formData.productId)
          .single();

        if (product) {
          await supabase
            .from('products')
            .update({
              current_stock_quantity: product.current_stock_quantity - formData.quantity,
              total_sales: (product.total_sales || 0) + formData.quantity
            })
            .eq('id', formData.productId);
        }
      }

      return order;
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Sales order created successfully" });
      queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
      queryClient.invalidateQueries({ queryKey: ['bank_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['sales_payment_methods'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      onOpenChange(false);
    },
    onError: (error: any) => {
      console.error('Error creating sales order:', error);
      toast({ title: "Error", description: "Failed to create sales order", variant: "destructive" });
    }
  });

  const isCreateOrderPending = createSalesOrderMutation.isPending;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleDateChange = (date: Date | undefined) => {
    if (date) {
      setFormData(prev => ({ ...prev, orderDate: date }));
    }
  };

  const handleProductChange = (productId: string) => {
    setFormData(prev => ({ ...prev, productId: productId }));
  };

  const handlePaymentMethodSelect = (method: any) => {
    setSelectedPaymentMethod(method);
  };

  const canProceedToNextStep = () => {
    if (currentStep === 1) {
      return formData.clientName && formData.clientPhone && formData.platform && formData.totalAmount && formData.orderDate;
    }
    if (currentStep === 2) {
      return true;
    }
    if (currentStep === 3) {
      return selectedPaymentMethod;
    }
    return true;
  };

  const handleCompleteOrder = async () => {
    createSalesOrderMutation.mutate();
  };

  const renderStep1 = () => (
    <div className="space-y-4">
      <div>
        <Label htmlFor="clientName">Client Name</Label>
        <Input 
          type="text" 
          id="clientName" 
          name="clientName" 
          value={formData.clientName} 
          onChange={handleInputChange} 
        />
      </div>
      <div>
        <Label htmlFor="clientPhone">Client Phone</Label>
        <Input 
          type="text" 
          id="clientPhone" 
          name="clientPhone" 
          value={formData.clientPhone} 
          onChange={handleInputChange} 
        />
      </div>
      <div>
        <Label htmlFor="platform">Platform</Label>
        <Input 
          type="text" 
          id="platform" 
          name="platform" 
          value={formData.platform} 
          onChange={handleInputChange} 
        />
      </div>
      <div>
        <Label htmlFor="totalAmount">Total Amount</Label>
        <Input 
          type="number" 
          id="totalAmount" 
          name="totalAmount" 
          value={formData.totalAmount} 
          onChange={handleInputChange} 
        />
      </div>
      <div>
        <Label htmlFor="orderDate">Order Date</Label>
        <Input
          type="date"
          id="orderDate"
          name="orderDate"
          value={format(new Date(formData.orderDate), 'yyyy-MM-dd')}
          onChange={handleInputChange}
        />
      </div>
      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea 
          id="description" 
          name="description" 
          value={formData.description} 
          onChange={handleInputChange} 
        />
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-4">
      <div>
        <Label htmlFor="productId">Product</Label>
        <Select onValueChange={handleProductChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select a product" />
          </SelectTrigger>
          <SelectContent>
            {products?.map((product) => (
              <SelectItem key={product.id} value={product.id}>
                {product.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="quantity">Quantity</Label>
        <Input 
          type="number" 
          id="quantity" 
          name="quantity" 
          value={formData.quantity} 
          onChange={handleInputChange} 
        />
      </div>
      <div>
        <Label htmlFor="pricePerUnit">Price Per Unit</Label>
        <Input 
          type="number" 
          id="pricePerUnit" 
          name="pricePerUnit" 
          value={formData.pricePerUnit} 
          onChange={handleInputChange} 
        />
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-4">
      <div>
        <Label htmlFor="paymentMethod">Payment Method</Label>
        <Select onValueChange={(value) => {
          const method = paymentMethods?.find(m => m.id === value);
          if (method) {
            handlePaymentMethodSelect(method);
          }
        }}>
          <SelectTrigger>
            <SelectValue placeholder="Select a payment method" />
          </SelectTrigger>
          <SelectContent>
            {paymentMethods?.map((method) => (
              <SelectItem key={method.id} value={method.id}>
                {method.type} - {method.bank_accounts?.account_name || method.upi_id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="riskLevel">Risk Level</Label>
        <Select onValueChange={(value) => setFormData(prev => ({ ...prev, riskLevel: value }))}>
          <SelectTrigger>
            <SelectValue placeholder="Select risk level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="LOW">Low</SelectItem>
            <SelectItem value="MEDIUM">Medium</SelectItem>
            <SelectItem value="HIGH">High</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  const renderStep4 = () => {
    if (!selectedPaymentMethod) {
      return (
        <div className="text-center py-8">
          <p className="text-gray-500">No payment method selected</p>
        </div>
      );
    }

    const displayMethod = mode === 'alternative-same-type' && selectedAlternativeMethod 
      ? selectedAlternativeMethod 
      : selectedPaymentMethod;

    return (
      <div className="space-y-6">
        <div className="text-center">
          <h3 className="text-lg font-semibold mb-2">Payment Method Details</h3>
          <p className="text-gray-600">Review and copy the payment details</p>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                💳
              </div>
              <span className="font-medium text-gray-700">Selected Payment Method</span>
            </div>
            <Badge variant="secondary" className="bg-green-100 text-green-800">
              {displayMethod.type}
            </Badge>
          </div>

          <div className="space-y-4">
            {displayMethod.type === 'UPI' ? (
              <div className="bg-white rounded-lg p-4 border">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">UPI ID</p>
                    <p className="font-mono text-lg font-medium">{displayMethod.upi_id}</p>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(displayMethod.upi_id);
                      toast({ title: "Copied", description: "UPI ID copied to clipboard" });
                    }}
                  >
                    <Copy className="h-4 w-4 mr-1" />
                    Copy
                  </Button>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg p-4 border space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Account Name</p>
                    <p className="font-medium">{displayMethod.bank_accounts?.account_name}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Bank Name</p>
                    <p className="font-medium">{displayMethod.bank_accounts?.bank_name}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Account Number</p>
                    <p className="font-mono font-medium">{displayMethod.bank_accounts?.account_number}</p>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(displayMethod.bank_accounts?.account_number);
                      toast({ title: "Copied", description: "Account number copied to clipboard" });
                    }}
                  >
                    <Copy className="h-4 w-4 mr-1" />
                    Copy
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">IFSC Code</p>
                    <p className="font-mono font-medium">{displayMethod.bank_accounts?.IFSC}</p>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(displayMethod.bank_accounts?.IFSC);
                      toast({ title: "Copied", description: "IFSC code copied to clipboard" });
                    }}
                  >
                    <Copy className="h-4 w-4 mr-1" />
                    Copy
                  </Button>
                </div>
              </div>
            )}

            <div className="bg-blue-50 rounded-lg p-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-600">Risk Category</p>
                  <p className="font-medium">{displayMethod.risk_category}</p>
                </div>
                <div>
                  <p className="text-gray-600">Available Limit</p>
                  <p className="font-medium">₹{(displayMethod.payment_limit - (displayMethod.current_usage || 0)).toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {mode === 'alternative-same-type' && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-800">
              ✨ This is an alternative payment method for order #{alternativeOrderData?.order?.order_number}
            </p>
          </div>
        )}
      </div>
    );
  };

  const renderStep5 = () => (
    <div className="text-center">
      <h3 className="text-lg font-semibold mb-4">Order Summary</h3>
      <p className="text-gray-600">Review the order details before submitting</p>
      <div className="mt-6">
        <p>Client Name: {formData.clientName}</p>
        <p>Client Phone: {formData.clientPhone}</p>
        <p>Platform: {formData.platform}</p>
        <p>Total Amount: {formData.totalAmount}</p>
        {/* Display other order details here */}
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Step-by-Step Sales Order Process
            {mode === 'alternative-same-type' && " - Alternative Payment Method"}
            {mode === 'alternative-change-type' && " - Change Payment Type"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Step Progress Indicator */}
          <div className="flex justify-between items-center">
            {[1, 2, 3, 4, 5].map((step) => (
              <div key={step} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step === currentStep 
                    ? 'bg-blue-600 text-white' 
                    : step < currentStep 
                    ? 'bg-green-600 text-white' 
                    : 'bg-gray-200 text-gray-600'
                }`}>
                  {step}
                </div>
                {step < 5 && (
                  <div className={`w-12 h-1 mx-2 ${
                    step < currentStep ? 'bg-green-600' : 'bg-gray-200'
                  }`} />
                )}
              </div>
            ))}
          </div>

          {/* Step Content */}
          <div className="min-h-[400px]">
            {currentStep === 1 && renderStep1()}
            {currentStep === 2 && renderStep2()}
            {currentStep === 3 && renderStep3()}
            {currentStep === 4 && renderStep4()}
            {currentStep === 5 && renderStep5()}
          </div>

          {/* Navigation Buttons */}
          <div className="flex justify-between">
            <Button 
              variant="outline" 
              onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
              disabled={currentStep === 1 || (mode === 'alternative-same-type' && currentStep === 4)}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            
            <div className="flex gap-2">
              {currentStep < 5 ? (
                <Button 
                  onClick={() => setCurrentStep(Math.min(5, currentStep + 1))}
                  disabled={!canProceedToNextStep()}
                >
                  Continue
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button 
                  onClick={handleCompleteOrder}
                  disabled={isCreateOrderPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {isCreateOrderPending ? 'Processing...' : 'Complete Order'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
