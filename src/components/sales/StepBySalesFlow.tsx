import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { UserPlus, RefreshCw, AlertTriangle, CheckCircle, X, RotateCcw, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface StepBySalesFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type FlowStep = 'order-type' | 'amount-verification' | 'payment-type-selection' | 'payment-method-display' | 'action-buttons' | 'final-form' | 'alternative-method-choice';

export function StepBySalesFlow({ open, onOpenChange }: StepBySalesFlowProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [currentStep, setCurrentStep] = useState<FlowStep>('order-type');
  const [orderType, setOrderType] = useState<'repeat' | 'new' | null>(null);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [newClientData, setNewClientData] = useState({
    name: '',
    phone: '',
    platform: '',
    client_type: 'INDIVIDUAL',
    risk_appetite: 'HIGH'
  });
  const [orderAmount, setOrderAmount] = useState(0);
  const [cosmosAlert, setCosmosAlert] = useState(false);
  const [paymentType, setPaymentType] = useState<'UPI' | 'Bank Transfer' | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<any>(null);
  const [availablePaymentMethods, setAvailablePaymentMethods] = useState<any[]>([]);
  const [usedPaymentMethods, setUsedPaymentMethods] = useState<string[]>([]);
  // Generate unique order number
  const generateOrderNumber = () => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `ORD-${timestamp}-${random}`;
  };

  const [finalOrderData, setFinalOrderData] = useState({
    order_number: generateOrderNumber(), 
    platform: '', 
    quantity: 1, 
    description: '', 
    stockName: '', 
    warehouseId: '', 
    price: 0 
  });

  // Fetch existing clients
  const { data: clients } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('*').order('name');
      if (error) throw error;
      return data;
    },
  });

  // Fetch products with available quantity
  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .gt('current_stock_quantity', 0);
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch warehouses
  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('warehouses')
        .select('*')
        .eq('is_active', true);
      
      if (error) throw error;
      return data;
    },
  });

  const getRiskCategoryFromAppetite = (appetite: string) => {
    switch (appetite) {
      case 'LOW': return 'Low Risk';
      case 'MEDIUM': return 'Medium Risk';
      case 'HIGH': return 'High Risk';
      case 'NONE': return 'No Risk';
      default: return 'High Risk';
    }
  };

  // Fetch payment methods when payment type is selected
  const fetchPaymentMethods = async () => {
    if (!paymentType) return;
    
    const riskLevel = selectedClient?.risk_appetite || newClientData.risk_appetite;
    const riskCategory = getRiskCategoryFromAppetite(riskLevel);
    
    let query = supabase
      .from('sales_payment_methods')
      .select('*, bank_accounts:bank_account_id(account_name, bank_name, account_number, IFSC, bank_account_holder_name), payment_gateway')
      .eq('is_active', true)
      .eq('risk_category', riskCategory);

    if (paymentType) {
      query = query.eq('type', paymentType === 'UPI' ? 'UPI' : 'Bank Account');
    }

    const { data, error } = await query;
    if (error) throw error;
    
    setAvailablePaymentMethods(data || []);
    
    // Find next available payment method that hasn't been used
    if (data && data.length > 0) {
      const availableMethod = data.find(method => 
        method.current_usage < method.payment_limit && 
        !usedPaymentMethods.includes(method.id)
      );
      setSelectedPaymentMethod(availableMethod || null);
    }
  };

  useEffect(() => {
    if (paymentType && (selectedClient || orderType === 'new')) {
      fetchPaymentMethods();
    }
  }, [paymentType, selectedClient, orderType, usedPaymentMethods]);

  // Auto-calculate quantity when amount or price changes
  useEffect(() => {
    if (finalOrderData.price > 0 && orderAmount > 0) {
      const calculatedQuantity = orderAmount / finalOrderData.price;
      setFinalOrderData(prev => ({ ...prev, quantity: calculatedQuantity }));
    }
  }, [orderAmount, finalOrderData.price]);

  // Create lead mutation
  const createLeadMutation = useMutation({
    mutationFn: async (leadData: any) => {
      const { data, error } = await supabase.from('leads').insert([leadData]).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({ title: "Order Cancelled", description: "Record moved to Leads for follow-up" });
      resetFlow();
      onOpenChange(false);
    }
  });

  // Create sales order mutation with proper data structure
  const createSalesOrderMutation = useMutation({
    mutationFn: async (orderData: any) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Get the selected product to link to the order
      const selectedProduct = products?.find(p => p.name === finalOrderData.stockName);
      
      // Prepare the complete sales order data
      const salesOrderData = {
        order_number: finalOrderData.order_number,
        client_name: selectedClient?.name || newClientData.name,
        client_phone: selectedClient?.phone || newClientData.phone,
        platform: finalOrderData.platform,
        product_id: selectedProduct?.id || null,
        warehouse_id: finalOrderData.warehouseId,
        quantity: finalOrderData.quantity,
        price_per_unit: finalOrderData.price,
        total_amount: orderAmount,
        sales_payment_method_id: selectedPaymentMethod?.id,
        payment_status: 'COMPLETED',
        status: 'COMPLETED',
        order_date: new Date().toISOString().split('T')[0],
        description: finalOrderData.description,
        cosmos_alert: cosmosAlert,
        risk_level: selectedClient?.risk_appetite || newClientData.risk_appetite,
        created_by: user?.id
      };

      console.log('Creating sales order with data:', salesOrderData);

      // First create the sales order
      const { data: salesOrder, error: salesError } = await supabase
        .from('sales_orders')
        .insert([salesOrderData])
        .select()
        .single();
      
      if (salesError) {
        console.error('Sales order creation error:', salesError);
        throw salesError;
      }

      console.log('Sales order created successfully:', salesOrder);

      // If payment method is selected and NOT a payment gateway, credit the amount to the linked bank account
      if (selectedPaymentMethod?.bank_account_id && !selectedPaymentMethod?.payment_gateway) {
        const { error: bankTransactionError } = await supabase
          .from('bank_transactions')
          .insert({
            bank_account_id: selectedPaymentMethod.bank_account_id,
            amount: orderAmount,
            transaction_type: 'INCOME',
            transaction_date: new Date().toISOString().split('T')[0],
            description: `Sales income from order ${finalOrderData.order_number} - ${selectedClient?.name || newClientData.name}`,
            reference_number: finalOrderData.order_number,
            category: 'Sales Revenue'
          });

        if (bankTransactionError) {
          console.error('Error creating bank transaction:', bankTransactionError);
          // Don't throw error, just log it as the sales order was created successfully
        }

        // Update payment method usage
        const { error: usageError } = await supabase
          .from('sales_payment_methods')
          .update({
            current_usage: selectedPaymentMethod.current_usage + orderAmount,
            updated_at: new Date().toISOString()
          })
          .eq('id', selectedPaymentMethod.id);

        if (usageError) {
          console.error('Error updating payment method usage:', usageError);
        }
      }

      // Update product stock if product is selected
      if (selectedProduct) {
        const { error: stockError } = await supabase
          .from('products')
          .update({
            current_stock_quantity: selectedProduct.current_stock_quantity - finalOrderData.quantity,
            total_sales: (selectedProduct.total_sales || 0) + finalOrderData.quantity,
            average_selling_price: selectedProduct.total_sales > 0 
              ? ((selectedProduct.average_selling_price || 0) * selectedProduct.total_sales + finalOrderData.price * finalOrderData.quantity) / (selectedProduct.total_sales + finalOrderData.quantity)
              : finalOrderData.price
          })
          .eq('id', selectedProduct.id);

        if (stockError) {
          console.error('Error updating product stock:', stockError);
        }

        // Create stock transaction record
        const { error: stockTransactionError } = await supabase
          .from('stock_transactions')
          .insert({
            product_id: selectedProduct.id,
            transaction_type: 'SALE',
            quantity: -finalOrderData.quantity, // Negative for outgoing stock
            unit_price: finalOrderData.price,
            total_amount: orderAmount,
            transaction_date: new Date().toISOString().split('T')[0],
            supplier_customer_name: selectedClient?.name || newClientData.name,
            reference_number: finalOrderData.order_number,
            reason: 'Sales Order'
          });

        if (stockTransactionError) {
          console.error('Error creating stock transaction:', stockTransactionError);
        }
      }

      return salesOrder;
    },
    onSuccess: (data) => {
      console.log('Sales order creation completed successfully:', data);
      toast({ 
        title: "Success", 
        description: "Sales order created successfully with all linked records updated" 
      });
      queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
      queryClient.invalidateQueries({ queryKey: ['bank_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['sales_payment_methods'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['stock_transactions'] });
      resetFlow();
      onOpenChange(false);
    },
    onError: (error) => {
      console.error('Sales order creation failed:', error);
      toast({ 
        title: "Error", 
        description: "Failed to create sales order. Please check the details and try again.",
        variant: "destructive"
      });
    }
  });

  const resetFlow = () => {
    setCurrentStep('order-type');
    setOrderType(null);
    setSelectedClient(null);
    setNewClientData({ name: '', phone: '', platform: '', client_type: 'INDIVIDUAL', risk_appetite: 'HIGH' });
    setOrderAmount(0);
    setCosmosAlert(false);
    setPaymentType(null);
    setSelectedPaymentMethod(null);
    setAvailablePaymentMethods([]);
    setUsedPaymentMethods([]);
    setFinalOrderData({ order_number: generateOrderNumber(), platform: '', quantity: 1, description: '', stockName: '', warehouseId: '', price: 0 });
  };

  const handleOrderTypeSelection = (type: 'repeat' | 'new') => {
    setOrderType(type);
    setCurrentStep('amount-verification');
  };

  const handleAmountVerification = () => {
    if (selectedClient && orderAmount > (selectedClient.monthly_limit - selectedClient.current_month_used)) {
      setCosmosAlert(true);
    }
    setCurrentStep('payment-type-selection');
  };

  const handlePaymentTypeSelection = () => {
    setCurrentStep('payment-method-display');
  };

  const handleContinueToActions = () => {
    setCurrentStep('action-buttons');
  };

  const handleOrderCancelled = () => {
    const leadData = {
      name: selectedClient?.name || newClientData.name,
      contact_number: selectedClient?.phone || newClientData.phone,
      estimated_order_value: orderAmount,
      status: 'NEW',
      source: 'Cancelled Sales Order',
      description: `Cancelled order for amount ₹${orderAmount}`
    };
    createLeadMutation.mutate(leadData);
  };

  const handleAlternativePaymentMethod = () => {
    setCurrentStep('alternative-method-choice');
  };

  const handleChangePaymentMethodType = () => {
    setPaymentType(null);
    setSelectedPaymentMethod(null);
    setUsedPaymentMethods([]);
    setCurrentStep('payment-type-selection');
  };

  const handleKeepSamePaymentType = () => {
    if (selectedPaymentMethod) {
      const newUsedMethods = [...usedPaymentMethods, selectedPaymentMethod.id];
      setUsedPaymentMethods(newUsedMethods);
      
      const nextMethod = availablePaymentMethods.find(method => 
        method.current_usage < method.payment_limit && 
        !newUsedMethods.includes(method.id) &&
        method.type === (paymentType === 'UPI' ? 'UPI' : 'Bank Account')
      );
      
      if (nextMethod) {
        setSelectedPaymentMethod(nextMethod);
        setCurrentStep('payment-method-display');
      } else {
        setSelectedPaymentMethod(null);
        setCurrentStep('payment-method-display');
      }
    }
  };

  const handlePaymentReceived = () => {
    setFinalOrderData(prev => ({
      ...prev,
      platform: selectedClient?.platform || newClientData.platform || ''
    }));
    setCurrentStep('final-form');
  };

  const handleFinalSubmit = () => {
    console.log('Final submit clicked with data:', {
      finalOrderData,
      selectedClient,
      newClientData,
      orderAmount,
      selectedPaymentMethod,
      cosmosAlert
    });

    // Validate required fields
    if (!finalOrderData.order_number) {
      toast({ title: "Error", description: "Order number is required", variant: "destructive" });
      return;
    }
    if (!finalOrderData.stockName) {
      toast({ title: "Error", description: "Stock selection is required", variant: "destructive" });
      return;
    }
    if (!finalOrderData.warehouseId) {
      toast({ title: "Error", description: "Warehouse selection is required", variant: "destructive" });
      return;
    }
    if (!finalOrderData.price || finalOrderData.price <= 0) {
      toast({ title: "Error", description: "Valid price is required", variant: "destructive" });
      return;
    }

    createSalesOrderMutation.mutate({});
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: "Payment details copied to clipboard" });
  };

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 'order-type':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Step 1: Choose Order Type</h3>
            <div className="grid grid-cols-1 gap-4">
              <Card 
                className={`cursor-pointer transition-all ${orderType === 'repeat' ? 'ring-2 ring-blue-500' : 'hover:shadow-md'}`}
                onClick={() => handleOrderTypeSelection('repeat')}
              >
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <RefreshCw className="h-5 w-5 text-green-600" />
                    Repeat Order ✅
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600">
                    System fetches a searchable dropdown of all existing clients (by name, ID, or platform)
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        );

      case 'amount-verification':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Step 2: Enter Order Amount</h3>
            
            {orderType === 'repeat' && (
              <div>
                <Label>Select Existing Client</Label>
                <Select onValueChange={(value) => {
                  const client = clients?.find(c => c.id === value);
                  setSelectedClient(client);
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Search client by name, ID, or platform" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients?.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        <div>
                          <div className="font-medium">{client.name}</div>
                          <div className="text-sm text-gray-500">
                            ID: {client.client_id} | Risk: {client.risk_appetite}
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {orderType === 'new' && (
              <div className="space-y-3">
                <div>
                  <Label>Client Name</Label>
                  <Input 
                    value={newClientData.name}
                    onChange={(e) => setNewClientData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Enter client name"
                  />
                </div>
                <div>
                  <Label>Phone Number</Label>
                  <Input 
                    value={newClientData.phone}
                    onChange={(e) => setNewClientData(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="Enter phone number"
                  />
                </div>
                <div>
                  <Label>Platform</Label>
                  <Input 
                    value={newClientData.platform}
                    onChange={(e) => setNewClientData(prev => ({ ...prev, platform: e.target.value }))}
                    placeholder="Enter platform"
                  />
                </div>
                <div className="p-3 bg-yellow-50 rounded-lg">
                  <p className="text-sm text-yellow-800">
                    <strong>Note:</strong> New clients automatically get HIGH risk appetite by default
                  </p>
                </div>
              </div>
            )}

            <div>
              <Label>Order Amount</Label>
              <Input 
                type="number"
                value={orderAmount}
                onChange={(e) => setOrderAmount(parseFloat(e.target.value) || 0)}
                placeholder="Enter order amount"
              />
            </div>

            {selectedClient && orderAmount > 0 && (
              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium mb-2">COSMOS Limit Verification</h4>
                <div className="text-sm space-y-1">
                  <div>Monthly Limit: ₹{selectedClient.monthly_limit?.toLocaleString()}</div>
                  <div>Used This Month: ₹{selectedClient.current_month_used?.toLocaleString()}</div>
                  <div>Available: ₹{(selectedClient.monthly_limit - selectedClient.current_month_used)?.toLocaleString()}</div>
                </div>
                {orderAmount > (selectedClient.monthly_limit - selectedClient.current_month_used) && (
                  <Badge variant="destructive" className="mt-2">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    COSMOS Alert Triggered!
                  </Badge>
                )}
              </div>
            )}

            <Button 
              onClick={handleAmountVerification}
              disabled={!orderAmount || (orderType === 'repeat' && !selectedClient) || (orderType === 'new' && !newClientData.name)}
              className="w-full"
            >
              Continue to Payment Method
            </Button>
          </div>
        );

      case 'payment-type-selection':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Step 3: Choose Payment Method Type</h3>
            
            <div className="space-y-3">
              <div>
                <Label>Payment Type</Label>
                <Select onValueChange={(value: 'UPI' | 'Bank Transfer') => setPaymentType(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select payment type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UPI">UPI</SelectItem>
                    <SelectItem value="Bank Transfer">Bank Transfer (IMPS/NEFT)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="p-4 bg-blue-50 rounded-lg">
                <h4 className="font-medium mb-2">Client Risk Information</h4>
                <div className="text-sm space-y-1">
                  <div><strong>Client Risk Level:</strong> {selectedClient?.risk_appetite || newClientData.risk_appetite}</div>
                  <div><strong>Risk Category:</strong> {getRiskCategoryFromAppetite(selectedClient?.risk_appetite || newClientData.risk_appetite)}</div>
                </div>
              </div>
            </div>

            <Button 
              onClick={handlePaymentTypeSelection}
              disabled={!paymentType}
              className="w-full"
            >
              Continue
            </Button>
          </div>
        );

      case 'payment-method-display':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Step 4: Payment Method Details</h3>
            
            {selectedPaymentMethod ? (
              <div className="p-4 bg-green-50 rounded-lg border">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-green-800">🔁 Selected Payment Method</h4>
                  <Badge className="bg-green-100 text-green-800">
                    {selectedPaymentMethod.type}
                  </Badge>
                </div>
                
                {selectedPaymentMethod.type === 'UPI' ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-white rounded border">
                      <div>
                        <div className="font-medium">UPI ID</div>
                        <div className="text-lg font-mono">{selectedPaymentMethod.upi_id}</div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(selectedPaymentMethod.upi_id)}
                      >
                        <Copy className="h-4 w-4 mr-1" />
                        Copy
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-white rounded border">
                      <div>
                        <div className="font-medium">Account Holder Name</div>
                        <div className="text-lg">{selectedPaymentMethod.bank_accounts?.bank_account_holder_name}</div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(selectedPaymentMethod.bank_accounts?.bank_account_holder_name || '')}
                      >
                        <Copy className="h-4 w-4 mr-1" />
                        Copy
                      </Button>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-white rounded border">
                      <div>
                        <div className="font-medium">Account Number</div>
                        <div className="text-lg font-mono">{selectedPaymentMethod.bank_accounts?.account_number}</div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(selectedPaymentMethod.bank_accounts?.account_number || '')}
                      >
                        <Copy className="h-4 w-4 mr-1" />
                        Copy
                      </Button>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-white rounded border">
                      <div>
                        <div className="font-medium">IFSC Code</div>
                        <div className="text-lg font-mono">{selectedPaymentMethod.bank_accounts?.IFSC}</div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(selectedPaymentMethod.bank_accounts?.IFSC || '')}
                      >
                        <Copy className="h-4 w-4 mr-1" />
                        Copy
                      </Button>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-white rounded border">
                      <div>
                        <div className="font-medium">Bank Name</div>
                        <div className="text-lg">{selectedPaymentMethod.bank_accounts?.bank_name}</div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(selectedPaymentMethod.bank_accounts?.bank_name || '')}
                      >
                        <Copy className="h-4 w-4 mr-1" />
                        Copy
                      </Button>
                    </div>
                  </div>
                )}

                <div className="mt-3 text-sm text-gray-600">
                  <div><strong>Risk Category:</strong> {selectedPaymentMethod.risk_category}</div>
                  <div><strong>Available Limit:</strong> ₹{(selectedPaymentMethod.payment_limit - selectedPaymentMethod.current_usage)?.toLocaleString()}</div>
                  {selectedPaymentMethod.current_usage >= selectedPaymentMethod.payment_limit && (
                    <Badge variant="destructive" className="mt-1">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Payment limit exceeded!
                    </Badge>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-4 bg-red-50 rounded-lg">
                <p className="text-sm text-red-800">
                  {availablePaymentMethods.length === 0 
                    ? `No payment methods available for ${paymentType} with ${selectedClient?.risk_appetite || newClientData.risk_appetite} risk level. Please contact administrator to add payment methods.`
                    : "All available payment methods have been provided. No available methods left. Contact your admin."
                  }
                </p>
              </div>
            )}

            <Button 
              onClick={handleContinueToActions}
              disabled={!selectedPaymentMethod}
              className="w-full"
            >
              Continue
            </Button>
          </div>
        );

      case 'alternative-method-choice':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Change Payment Method</h3>
            
            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800 mb-4">
                Would you like to change the payment method type (UPI/Bank Transfer) or keep the same type but get an alternative method?
              </p>
              
              <div className="space-y-3">
                <Button 
                  onClick={handleChangePaymentMethodType}
                  className="w-full"
                  variant="outline"
                >
                  Change Payment Method Type
                </Button>
                
                <Button 
                  onClick={handleKeepSamePaymentType}
                  className="w-full"
                >
                  Keep Same Type - Get Alternative Method
                </Button>
              </div>
            </div>
          </div>
        );

      case 'action-buttons':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">⚠️ Three Action Buttons After Payment Method Is Given</h3>
            
            <div className="space-y-3">
              <Button 
                variant="destructive" 
                onClick={handleOrderCancelled}
                className="w-full flex items-center gap-2"
              >
                <X className="h-4 w-4" />
                🔴 Order Cancelled
              </Button>
              <p className="text-xs text-gray-600 px-2">
                Moves the record into the Leads Tab for future follow-up. Auto-attaches metadata: reason, date/time, who cancelled.
              </p>

              <Button 
                variant="outline" 
                onClick={handleAlternativePaymentMethod}
                className="w-full flex items-center gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                🟡 Alternative Payment Method
              </Button>
              <p className="text-xs text-gray-600 px-2">
                Allows you to change payment method type or get an alternative method of the same type.
              </p>

              <Button 
                onClick={handlePaymentReceived}
                className="w-full flex items-center gap-2"
              >
                <CheckCircle className="h-4 w-4" />
                🟢 Payment Received
              </Button>
              <p className="text-xs text-gray-600 px-2">
                Opens form to capture the full sales data with auto pre-filled information wherever possible.
              </p>
            </div>
          </div>
        );

      case 'final-form':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">📋 Final Sales Entry Form</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Customer Name</Label>
                <Input 
                  value={selectedClient?.name || newClientData.name}
                  disabled
                  className="bg-gray-100"
                />
              </div>

              <div>
                <Label>Customer Contact Number</Label>
                <Input 
                  value={selectedClient?.phone || newClientData.phone}
                  disabled
                  className="bg-gray-100"
                />
              </div>

              <div>
                <Label>Platform Name</Label>
                <Input 
                  value={selectedClient?.platform || newClientData.platform || ''}
                  disabled
                  className="bg-gray-100"
                />
              </div>

              <div>
                <Label>Order Number</Label>
                <Input 
                  value={finalOrderData.order_number}
                  onChange={(e) => setFinalOrderData(prev => ({ ...prev, order_number: e.target.value }))}
                  placeholder="Enter order number"
                />
              </div>

              <div>
                <Label>Stock Name</Label>
                <Select 
                  value={finalOrderData.stockName} 
                  onValueChange={(value) => setFinalOrderData(prev => ({ ...prev, stockName: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select stock" />
                  </SelectTrigger>
                  <SelectContent>
                    {products?.map((product) => (
                      <SelectItem key={product.id} value={product.name}>
                        {product.name} - {product.code} (Available: {product.current_stock_quantity} {product.unit_of_measurement})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Select Warehouse</Label>
                <Select 
                  value={finalOrderData.warehouseId} 
                  onValueChange={(value) => setFinalOrderData(prev => ({ ...prev, warehouseId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select warehouse" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses?.map((warehouse) => (
                      <SelectItem key={warehouse.id} value={warehouse.id}>
                        {warehouse.name} - {warehouse.location}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Amount of Sales</Label>
                <Input 
                  type="number"
                  value={orderAmount}
                  disabled
                  className="bg-gray-100"
                />
              </div>

              <div>
                <Label>Price</Label>
                <Input 
                  type="number"
                  step="0.01"
                  value={finalOrderData.price}
                  onChange={(e) => setFinalOrderData(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                  placeholder="Enter price"
                />
              </div>

              <div>
                <Label>Quantity</Label>
                <Input 
                  type="number"
                  step="0.01"
                  value={finalOrderData.quantity}
                  disabled
                  className="bg-gray-100"
                  placeholder="Auto-calculated"
                />
              </div>

              <div>
                <Label>Payment Received In</Label>
                <Input 
                  value={selectedPaymentMethod?.bank_accounts?.account_name || 'N/A'}
                  disabled
                  className="bg-gray-100"
                />
              </div>
            </div>

            <div>
              <Label>Order Description (Optional)</Label>
              <Textarea 
                value={finalOrderData.description}
                onChange={(e) => setFinalOrderData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Enter order description"
                rows={3}
              />
            </div>

            <Button 
              onClick={handleFinalSubmit}
              disabled={!finalOrderData.order_number || !finalOrderData.stockName || !finalOrderData.warehouseId || !finalOrderData.price || createSalesOrderMutation.isPending}
              className="w-full"
            >
              {createSalesOrderMutation.isPending ? "Creating Order..." : "Complete Sales Order"}
            </Button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Step-by-Step Sales Order Process</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {renderCurrentStep()}
        </div>

        <div className="flex justify-between pt-4 border-t">
          <Button 
            variant="outline" 
            onClick={() => {
              if (currentStep === 'order-type') {
                onOpenChange(false);
              } else {
                const steps: FlowStep[] = ['order-type', 'amount-verification', 'payment-type-selection', 'payment-method-display', 'action-buttons', 'final-form'];
                const currentIndex = steps.indexOf(currentStep);
                if (currentIndex > 0) {
                  setCurrentStep(steps[currentIndex - 1]);
                }
              }
            }}
          >
            {currentStep === 'order-type' ? 'Cancel' : 'Back'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
