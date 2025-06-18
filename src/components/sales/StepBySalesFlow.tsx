import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { UserPlus, RefreshCw, AlertTriangle, CheckCircle, X, RotateCcw } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface StepBySalesFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type FlowStep = 'order-type' | 'amount-verification' | 'payment-method' | 'action-buttons' | 'final-form';

export function StepBySalesFlow({ open, onOpenChange }: StepBySalesFlowProps) {
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
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<any>(null);
  const [paymentType, setPaymentType] = useState<'UPI' | 'Bank Transfer' | null>(null);
  const [finalOrderData, setFinalOrderData] = useState({
    order_number: '',
    platform: '',
    quantity: 1,
    description: '',
    credits_applied: 0
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch existing clients
  const { data: clients } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('*').order('name');
      if (error) throw error;
      return data;
    },
  });

  // Fetch payment methods based on risk category and type
  const { data: paymentMethods } = useQuery({
    queryKey: ['sales_payment_methods', selectedClient?.risk_appetite || newClientData.risk_appetite, paymentType],
    queryFn: async () => {
      let query = supabase
        .from('sales_payment_methods')
        .select('*, bank_accounts:bank_account_id(account_name, bank_name)')
        .eq('is_active', true);

      // Filter by client risk category
      const riskLevel = selectedClient?.risk_appetite || newClientData.risk_appetite;
      const riskCategory = getRiskCategoryFromAppetite(riskLevel);
      query = query.eq('risk_category', riskCategory);

      // Filter by payment type if selected
      if (paymentType) {
        query = query.eq('type', paymentType === 'UPI' ? 'UPI' : 'Bank Account');
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!selectedClient || orderType === 'new'
  });

  // Auto-select the first available payment method when paymentType changes
  useEffect(() => {
    if (paymentMethods && paymentMethods.length > 0 && paymentType) {
      const availableMethod = paymentMethods.find(method => 
        method.current_usage < method.payment_limit
      );
      if (availableMethod) {
        setSelectedPaymentMethod(availableMethod);
      } else {
        // If no method has available limit, still select the first one but show warning
        setSelectedPaymentMethod(paymentMethods[0]);
      }
    }
  }, [paymentMethods, paymentType]);

  const getRiskCategoryFromAppetite = (appetite: string) => {
    switch (appetite) {
      case 'LOW': return 'Low Risk';
      case 'MEDIUM': return 'Medium Risk';
      case 'HIGH': return 'High Risk';
      case 'NONE': return 'No Risk';
      default: return 'High Risk'; // Default for new clients
    }
  };

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

  // Create sales order mutation
  const createSalesOrderMutation = useMutation({
    mutationFn: async (orderData: any) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('sales_orders')
        .insert([{ ...orderData, created_by: user?.id }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Sales order created successfully" });
      queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
      resetFlow();
      onOpenChange(false);
    }
  });

  const resetFlow = () => {
    setCurrentStep('order-type');
    setOrderType(null);
    setSelectedClient(null);
    setNewClientData({ name: '', phone: '', platform: '', client_type: 'INDIVIDUAL', risk_appetite: 'HIGH' });
    setOrderAmount(0);
    setCosmosAlert(false);
    setSelectedPaymentMethod(null);
    setPaymentType(null);
    setFinalOrderData({ order_number: '', platform: '', quantity: 1, description: '', credits_applied: 0 });
  };

  const handleOrderTypeSelection = (type: 'repeat' | 'new') => {
    setOrderType(type);
    setCurrentStep('amount-verification');
  };

  const handleAmountVerification = () => {
    if (selectedClient && orderAmount > (selectedClient.monthly_limit - selectedClient.current_month_used)) {
      setCosmosAlert(true);
    }
    setCurrentStep('payment-method');
  };

  const handlePaymentMethodSelection = () => {
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
    setSelectedPaymentMethod(null);
    setPaymentType(null);
    setCurrentStep('payment-method');
  };

  const handlePaymentReceived = () => {
    setCurrentStep('final-form');
  };

  const handleFinalSubmit = () => {
    const orderData = {
      order_number: finalOrderData.order_number,
      client_name: selectedClient?.name || newClientData.name,
      platform: finalOrderData.platform,
      amount: orderAmount,
      quantity: finalOrderData.quantity,
      price_per_unit: orderAmount / finalOrderData.quantity,
      order_date: new Date().toISOString().split('T')[0],
      payment_status: 'COMPLETED',
      sales_payment_method_id: selectedPaymentMethod?.id,
      description: finalOrderData.description,
      cosmos_alert: cosmosAlert,
      credits_applied: finalOrderData.credits_applied,
      status: 'COMPLETED'
    };
    createSalesOrderMutation.mutate(orderData);
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

              <Card 
                className={`cursor-pointer transition-all ${orderType === 'new' ? 'ring-2 ring-blue-500' : 'hover:shadow-md'}`}
                onClick={() => handleOrderTypeSelection('new')}
              >
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <UserPlus className="h-5 w-5 text-blue-600" />
                    New Client ➕
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600">
                    Manual form to enter new client details (Name, Phone, Platform, etc.)
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

      case 'payment-method':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Step 3: Choose Payment Method</h3>
            
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

              {paymentType && selectedPaymentMethod && (
                <div className="p-4 bg-blue-50 rounded-lg">
                  <h4 className="font-medium mb-2">🔁 Auto-Selected Payment Method</h4>
                  <div className="text-sm space-y-1">
                    <div><strong>Client Risk Level:</strong> {selectedClient?.risk_appetite || newClientData.risk_appetite}</div>
                    <div><strong>Method:</strong> {selectedPaymentMethod.type === 'UPI' ? selectedPaymentMethod.upi_id : selectedPaymentMethod.bank_accounts?.account_name}</div>
                    <div><strong>Risk Category:</strong> {selectedPaymentMethod.risk_category}</div>
                    <div><strong>Available Limit:</strong> ₹{(selectedPaymentMethod.payment_limit - selectedPaymentMethod.current_usage)?.toLocaleString()}</div>
                    {selectedPaymentMethod.current_usage >= selectedPaymentMethod.payment_limit && (
                      <Badge variant="destructive" className="mt-1">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Payment limit exceeded! Consider alternative method.
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              {paymentMethods && paymentMethods.length === 0 && paymentType && (
                <div className="p-4 bg-red-50 rounded-lg">
                  <p className="text-sm text-red-800">
                    No payment methods available for {paymentType} with {selectedClient?.risk_appetite || newClientData.risk_appetite} risk level.
                    Please contact administrator to add payment methods.
                  </p>
                </div>
              )}
            </div>

            <Button 
              onClick={handlePaymentMethodSelection}
              disabled={!selectedPaymentMethod}
              className="w-full"
            >
              Confirm Payment Method
            </Button>
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
                Re-prompts the payment screen. Can switch from UPI to IMPS or vice versa. Tracks both attempts for audit logs.
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
                <Label>Platform Name</Label>
                <Input 
                  value={finalOrderData.platform}
                  onChange={(e) => setFinalOrderData(prev => ({ ...prev, platform: e.target.value }))}
                  placeholder="Enter platform"
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
                <Label>Quantity of Items Sold</Label>
                <Input 
                  type="number"
                  value={finalOrderData.quantity}
                  onChange={(e) => setFinalOrderData(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
                />
              </div>

              <div>
                <Label>Total Amount of Sale</Label>
                <Input 
                  type="number"
                  value={orderAmount}
                  onChange={(e) => setOrderAmount(parseFloat(e.target.value) || 0)}
                />
              </div>

              <div>
                <Label>Price per Item</Label>
                <Input 
                  value={(orderAmount / finalOrderData.quantity).toFixed(2)}
                  disabled
                  className="bg-gray-100"
                />
              </div>

              <div>
                <Label>Payment Received In (Bank)</Label>
                <Input 
                  value={selectedPaymentMethod?.type === 'UPI' ? selectedPaymentMethod.upi_id : selectedPaymentMethod?.bank_accounts?.account_name}
                  disabled
                  className="bg-gray-100"
                />
              </div>

              <div>
                <Label>Credits Applied</Label>
                <Input 
                  type="number"
                  value={finalOrderData.credits_applied}
                  onChange={(e) => setFinalOrderData(prev => ({ ...prev, credits_applied: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            </div>

            <div>
              <Label>Description</Label>
              <Textarea 
                value={finalOrderData.description}
                onChange={(e) => setFinalOrderData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Enter order description"
                rows={3}
              />
            </div>

            <Button 
              onClick={handleFinalSubmit}
              disabled={!finalOrderData.order_number || !finalOrderData.platform}
              className="w-full"
            >
              Complete Sales Order
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
                const steps: FlowStep[] = ['order-type', 'amount-verification', 'payment-method', 'action-buttons', 'final-form'];
                const currentIndex = steps.indexOf(currentStep);
                if (currentIndex > 0) {
                  setCurrentStep(steps[currentIndex - 1]);
                }
              }
            }}
          >
            {currentStep === 'order-type' ? 'Cancel' : 'Back'}
          </Button>
          
          <Button variant="outline" onClick={resetFlow}>
            Reset Flow
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
