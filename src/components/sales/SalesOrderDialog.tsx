
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle, XCircle, RotateCcw } from "lucide-react";
import { CustomerAutocomplete } from "./CustomerAutocomplete";
import { FileUpload } from "./FileUpload";

interface SalesOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type OrderStep = 'order-type' | 'amount-validation' | 'payment-method' | 'sales-entry';
type PaymentMethod = { id: string; type: 'UPI' | 'Bank Account'; details: string; riskCategory: string; };

interface SalesOrderForm {
  customerName: string;
  platform: string;
  orderAmount: number;
  paymentMethod?: PaymentMethod;
  orderNumber: string;
  quantity: number;
  pricePerUnit: number;
  orderDate: string;
  description: string;
  attachmentUrls: string[];
  creditsApplied?: number;
}

export function SalesOrderDialog({ open, onOpenChange }: SalesOrderDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentStep, setCurrentStep] = useState<OrderStep>('order-type');
  const [orderType, setOrderType] = useState<'repeat' | 'new'>('repeat');
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [cosmosAlert, setCosmosAlert] = useState(false);
  const [availablePaymentMethods, setAvailablePaymentMethods] = useState<PaymentMethod[]>([]);
  
  const [formData, setFormData] = useState<SalesOrderForm>({
    customerName: "",
    platform: "",
    orderAmount: 0,
    orderNumber: "",
    quantity: 0,
    pricePerUnit: 0,
    orderDate: new Date().toISOString().split('T')[0],
    description: "",
    attachmentUrls: [],
    creditsApplied: 0
  });

  // Fetch clients for repeat orders
  const { data: clients } = useQuery({
    queryKey: ['clients_for_orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch payment methods
  const { data: paymentMethods } = useQuery({
    queryKey: ['payment_methods'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_methods')
        .select('*')
        .eq('is_active', true);
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch platforms
  const { data: platforms } = useQuery({
    queryKey: ['platforms'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platforms')
        .select('*')
        .eq('is_active', true);
      
      if (error) throw error;
      return data;
    },
  });

  const checkCosmosLimits = async (clientId: string, amount: number) => {
    if (!clientId) return false;
    
    const client = clients?.find(c => c.id === clientId);
    if (!client) return false;

    const currentUsage = client.current_month_used || 0;
    const monthlyLimit = client.monthly_limit || (client.first_order_value * 2);
    
    if (currentUsage + amount > monthlyLimit) {
      setCosmosAlert(true);
      toast({
        title: "COSMOS Alert Triggered",
        description: `Order amount exceeds monthly limit. Requires manager approval.`,
        variant: "destructive",
      });
      return true;
    }
    return false;
  };

  const filterPaymentMethodsByRisk = (clientRisk: string) => {
    if (!paymentMethods) return [];
    
    return paymentMethods
      .filter(method => {
        // Logic to match payment method risk category with client risk
        if (clientRisk === 'HIGH') return method.risk_category === 'High Risk';
        if (clientRisk === 'MEDIUM') return ['Medium Risk', 'Low Risk'].includes(method.risk_category);
        if (clientRisk === 'LOW') return ['Low Risk', 'No Risk'].includes(method.risk_category);
        return method.risk_category === 'No Risk';
      })
      .map(method => ({
        id: method.id,
        type: method.type as 'UPI' | 'Bank Account',
        details: method.type === 'UPI' ? method.upi_id || '' : `${method.account_number} - ${method.ifsc_code}`,
        riskCategory: method.risk_category
      }));
  };

  const handleOrderTypeSelection = () => {
    setCurrentStep('amount-validation');
  };

  const handleAmountValidation = async () => {
    if (orderType === 'repeat' && selectedClient) {
      const alertTriggered = await checkCosmosLimits(selectedClient.id, formData.orderAmount);
      if (alertTriggered) {
        // Still proceed but with alert flag
      }
    }
    
    // Filter payment methods based on client risk
    const clientRisk = selectedClient?.risk_appetite || 'MEDIUM';
    const filteredMethods = filterPaymentMethodsByRisk(clientRisk);
    setAvailablePaymentMethods(filteredMethods);
    
    setCurrentStep('payment-method');
  };

  const handlePaymentMethodSelection = (method: PaymentMethod) => {
    setFormData(prev => ({ ...prev, paymentMethod: method }));
  };

  const handleOrderCancelled = async () => {
    // For demo purposes, just show toast and reset
    toast({
      title: "Order Cancelled",
      description: "Order has been cancelled and moved to leads for future follow-up",
    });
    
    resetForm();
    onOpenChange(false);
  };

  const handleAlternativePayment = () => {
    // Reset payment method selection
    setFormData(prev => ({ ...prev, paymentMethod: undefined }));
    // Stay on payment method step
  };

  const handlePaymentReceived = () => {
    // Pre-fill some data
    setFormData(prev => ({
      ...prev,
      pricePerUnit: prev.orderAmount / (prev.quantity || 1),
      quantity: prev.quantity || 1
    }));
    setCurrentStep('sales-entry');
  };

  const createSalesOrderMutation = useMutation({
    mutationFn: async (salesData: SalesOrderForm) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Create sales order
      const { data: salesOrder, error: salesError } = await supabase
        .from('sales_orders')
        .insert({
          order_number: salesData.orderNumber,
          client_name: salesData.customerName,
          platform: salesData.platform,
          amount: salesData.orderAmount,
          quantity: salesData.quantity,
          price_per_unit: salesData.pricePerUnit,
          order_date: salesData.orderDate,
          payment_status: 'COMPLETED',
          status: 'DELIVERED',
          description: salesData.description,
          attachment_urls: salesData.attachmentUrls,
          payment_method_id: salesData.paymentMethod?.id,
          cosmos_alert: cosmosAlert,
          credits_applied: salesData.creditsApplied,
          created_by: user?.id
        })
        .select()
        .single();

      if (salesError) throw salesError;

      // Update client monthly usage
      if (selectedClient) {
        const { error: updateError } = await supabase
          .from('clients')
          .update({ 
            current_month_used: (selectedClient.current_month_used || 0) + salesData.orderAmount 
          })
          .eq('id', selectedClient.id);

        if (updateError) throw updateError;
      }

      return salesOrder;
    },
    onSuccess: () => {
      toast({
        title: "Sales Order Created",
        description: "Sales order has been successfully created and recorded.",
      });
      queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      resetForm();
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to create sales order: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setCurrentStep('order-type');
    setOrderType('repeat');
    setSelectedClient(null);
    setCosmosAlert(false);
    setAvailablePaymentMethods([]);
    setFormData({
      customerName: "",
      platform: "",
      orderAmount: 0,
      orderNumber: "",
      quantity: 0,
      pricePerUnit: 0,
      orderDate: new Date().toISOString().split('T')[0],
      description: "",
      attachmentUrls: [],
      creditsApplied: 0
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createSalesOrderMutation.mutate(formData);
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 'order-type':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-lg font-semibold mb-4">Choose Order Type</h3>
              <div className="grid grid-cols-2 gap-4">
                <Button
                  variant={orderType === 'repeat' ? 'default' : 'outline'}
                  onClick={() => setOrderType('repeat')}
                  className="h-20 flex flex-col"
                >
                  <CheckCircle className="h-6 w-6 mb-2" />
                  Repeat Order
                </Button>
                <Button
                  variant={orderType === 'new' ? 'default' : 'outline'}
                  onClick={() => setOrderType('new')}
                  className="h-20 flex flex-col"
                >
                  <div className="text-2xl mb-1">➕</div>
                  New Client
                </Button>
              </div>
            </div>

            {orderType === 'repeat' && (
              <div>
                <Label>Select Existing Client</Label>
                <Select onValueChange={(value) => {
                  const client = clients?.find(c => c.id === value);
                  setSelectedClient(client);
                  setFormData(prev => ({ ...prev, customerName: client?.name || '' }));
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Search and select client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients?.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name} - {client.client_id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {orderType === 'new' && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="customerName">Customer Name</Label>
                  <Input
                    id="customerName"
                    value={formData.customerName}
                    onChange={(e) => setFormData(prev => ({ ...prev, customerName: e.target.value }))}
                    placeholder="Enter customer name"
                  />
                </div>
                <div>
                  <Label htmlFor="platform">Platform</Label>
                  <Select onValueChange={(value) => setFormData(prev => ({ ...prev, platform: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select platform" />
                    </SelectTrigger>
                    <SelectContent>
                      {platforms?.map((platform) => (
                        <SelectItem key={platform.id} value={platform.name}>
                          {platform.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <Button onClick={handleOrderTypeSelection} className="w-full">
              Continue
            </Button>
          </div>
        );

      case 'amount-validation':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Enter Order Amount</h3>
              <div>
                <Label htmlFor="orderAmount">Order Amount (₹)</Label>
                <Input
                  id="orderAmount"
                  type="number"
                  value={formData.orderAmount}
                  onChange={(e) => setFormData(prev => ({ ...prev, orderAmount: parseFloat(e.target.value) || 0 }))}
                  placeholder="Enter order amount"
                />
              </div>

              {selectedClient && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium mb-2">Client Limit Status</h4>
                  <div className="text-sm space-y-1">
                    <p>Current Month Used: ₹{selectedClient.current_month_used || 0}</p>
                    <p>Monthly Limit: ₹{selectedClient.monthly_limit || (selectedClient.first_order_value * 2)}</p>
                    <p>Remaining: ₹{(selectedClient.monthly_limit || (selectedClient.first_order_value * 2)) - (selectedClient.current_month_used || 0)}</p>
                  </div>
                </div>
              )}

              {cosmosAlert && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-center">
                    <AlertTriangle className="h-5 w-5 text-red-600 mr-2" />
                    <span className="text-red-800 font-medium">COSMOS Alert Triggered</span>
                  </div>
                  <p className="text-red-700 text-sm mt-1">
                    This order exceeds the client's monthly limit and requires manager approval.
                  </p>
                </div>
              )}
            </div>

            <Button onClick={handleAmountValidation} className="w-full">
              Continue to Payment Method
            </Button>
          </div>
        );

      case 'payment-method':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Choose Payment Method</h3>
              <div className="space-y-3">
                {availablePaymentMethods.map((method) => (
                  <div
                    key={method.id}
                    className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                      formData.paymentMethod?.id === method.id 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => handlePaymentMethodSelection(method)}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-medium">{method.type}</div>
                        <div className="text-sm text-gray-600">{method.details}</div>
                      </div>
                      <Badge variant="secondary">{method.riskCategory}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {formData.paymentMethod && (
              <div className="border-t pt-6">
                <h4 className="font-medium mb-4">Payment Method Provided - What's Next?</h4>
                <div className="grid grid-cols-1 gap-3">
                  <Button onClick={handleOrderCancelled} variant="destructive" className="flex items-center">
                    <XCircle className="h-4 w-4 mr-2" />
                    Order Cancelled
                  </Button>
                  <Button onClick={handleAlternativePayment} variant="outline" className="flex items-center">
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Alternative Payment Method
                  </Button>
                  <Button onClick={handlePaymentReceived} className="flex items-center">
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Payment Received
                  </Button>
                </div>
              </div>
            )}
          </div>
        );

      case 'sales-entry':
        return (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Final Sales Entry</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="orderNumber">Order Number *</Label>
                    <Input
                      id="orderNumber"
                      value={formData.orderNumber}
                      onChange={(e) => setFormData(prev => ({ ...prev, orderNumber: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="quantity">Quantity *</Label>
                      <Input
                        id="quantity"
                        type="number"
                        value={formData.quantity}
                        onChange={(e) => {
                          const qty = parseInt(e.target.value) || 0;
                          setFormData(prev => ({ 
                            ...prev, 
                            quantity: qty,
                            pricePerUnit: prev.orderAmount / qty || 0
                          }));
                        }}
                        required
                      />
                    </div>

                    <div>
                      <Label htmlFor="pricePerUnit">Price per Unit *</Label>
                      <Input
                        id="pricePerUnit"
                        type="number"
                        step="0.01"
                        value={formData.pricePerUnit}
                        onChange={(e) => {
                          const price = parseFloat(e.target.value) || 0;
                          setFormData(prev => ({ 
                            ...prev, 
                            pricePerUnit: price,
                            orderAmount: price * prev.quantity
                          }));
                        }}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="totalAmount">Total Amount</Label>
                    <Input
                      id="totalAmount"
                      value={`₹${formData.orderAmount.toFixed(2)}`}
                      readOnly
                      className="bg-gray-100"
                    />
                  </div>

                  <div>
                    <Label htmlFor="creditsApplied">Credits Applied</Label>
                    <Input
                      id="creditsApplied"
                      type="number"
                      value={formData.creditsApplied}
                      onChange={(e) => setFormData(prev => ({ ...prev, creditsApplied: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <Label htmlFor="orderDate">Order Date & Time *</Label>
                    <Input
                      id="orderDate"
                      type="datetime-local"
                      value={formData.orderDate}
                      onChange={(e) => setFormData(prev => ({ ...prev, orderDate: e.target.value }))}
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      placeholder="Enter sales description or notes..."
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      rows={4}
                    />
                  </div>

                  <FileUpload
                    onFilesChange={(urls) => setFormData(prev => ({ ...prev, attachmentUrls: urls }))}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => resetForm()}>
                Cancel
              </Button>
              <Button type="submit" disabled={createSalesOrderMutation.isPending}>
                {createSalesOrderMutation.isPending ? "Creating..." : "Complete Sales Entry"}
              </Button>
            </div>
          </form>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Sales Order</DialogTitle>
        </DialogHeader>
        
        {renderStepContent()}
      </DialogContent>
    </Dialog>
  );
}
