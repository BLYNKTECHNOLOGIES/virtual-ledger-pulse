import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CustomerAutocomplete } from "./CustomerAutocomplete";
import { AlertTriangle, CheckCircle, XCircle, RotateCcw, CreditCard, Building2 } from "lucide-react";

interface EnhancedOrderCreationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderType: 'repeat' | 'new' | null;
  onSalesEntryOpen?: (data: any) => void;
}

interface OrderStep {
  step: 'client' | 'amount' | 'payment' | 'completion';
}

export function EnhancedOrderCreationDialog({ 
  open, 
  onOpenChange, 
  orderType,
  onSalesEntryOpen 
}: EnhancedOrderCreationDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [currentStep, setCurrentStep] = useState<OrderStep['step']>('client');
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [orderAmount, setOrderAmount] = useState<number>(0);
  const [cosmosAlert, setCosmosAlert] = useState<boolean>(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<any>(null);
  const [paymentType, setPaymentType] = useState<'UPI' | 'Bank Account' | null>(null);
  const [alternativeAttempted, setAlternativeAttempted] = useState<boolean>(false);
  const [alternativeCount, setAlternativeCount] = useState<number>(0);
  
  const [newClientData, setNewClientData] = useState({
    name: "",
    phone: "",
    email: "",
    platform: "",
    risk_appetite: "HIGH"
  });

  // Fetch clients for repeat orders
  const { data: clients } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: orderType === 'repeat'
  });

  // Fetch platforms
  const { data: platforms } = useQuery({
    queryKey: ['platforms'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platforms')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  // Fetch client's previous payment methods for prioritization
  const { data: previousPaymentMethods } = useQuery({
    queryKey: ['client_previous_payments', selectedClient?.id],
    queryFn: async () => {
      if (!selectedClient?.id) return [];
      
      const { data, error } = await supabase
        .from('sales_orders')
        .select('sales_payment_method_id')
        .eq('client_name', selectedClient.name)
        .eq('payment_status', 'COMPLETED')
        .not('sales_payment_method_id', 'is', null)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!selectedClient?.id && currentStep === 'payment'
  });

  // Map client risk appetite to payment method risk category
  const mapClientRiskToPaymentRisk = (clientRisk: string) => {
    const riskMapping = {
      'HIGH': 'High Risk',
      'MEDIUM': 'Medium Risk', 
      'LOW': 'Low Risk',
      'NONE': 'No Risk'
    };
    return riskMapping[clientRisk as keyof typeof riskMapping] || 'HIGH';
  };

  // Fetch payment methods based on client risk and type
  const { data: paymentMethods, isLoading: paymentMethodsLoading } = useQuery({
    queryKey: ['sales_payment_methods', selectedClient?.risk_appetite, paymentType, alternativeCount, orderAmount],
    queryFn: async () => {
      if (!paymentType || !selectedClient?.risk_appetite || cosmosAlert) return [];
      
      console.log('Fetching payment methods for:', {
        paymentType,
        clientRisk: selectedClient.risk_appetite,
        mappedRisk: mapClientRiskToPaymentRisk(selectedClient.risk_appetite),
        alternativeCount,
        orderAmount
      });
      
      const mappedRiskCategory = mapClientRiskToPaymentRisk(selectedClient.risk_appetite);
      
      // Use the correct type for Bank Account methods
      const methodType = paymentType;
      
      let query = supabase
        .from('sales_payment_methods')
        .select(`
          *,
          bank_accounts:bank_account_id(account_name, bank_name, balance)
        `)
        .eq('is_active', true)
        .eq('type', methodType)
        .eq('risk_category', mappedRiskCategory);

      const { data, error } = await query.order('created_at');
      
      if (error) {
        console.error('Error fetching payment methods:', error);
        throw error;
      }
      
      console.log('Fetched payment methods:', data);
      
      // Filter methods with available limit >= order amount
      const filteredMethods = data.filter(method => {
        const availableLimit = method.payment_limit - (method.current_usage || 0);
        return availableLimit >= orderAmount;
      });
      
      console.log('Filtered methods with sufficient limit:', filteredMethods);
      
      if (filteredMethods.length === 0) {
        return [];
      }

      // If this is not an alternative attempt, prioritize based on previous usage
      if (alternativeCount === 0 && previousPaymentMethods && previousPaymentMethods.length > 0) {
        const usedMethodIds = previousPaymentMethods.map(pm => pm.sales_payment_method_id);
        const prioritized = filteredMethods.sort((a, b) => {
          const aUsed = usedMethodIds.includes(a.id);
          const bUsed = usedMethodIds.includes(b.id);
          if (aUsed && !bUsed) return -1;
          if (!aUsed && bUsed) return 1;
          return 0;
        });
        
        // Return only the top priority method for initial selection
        return prioritized.slice(0, 1);
      }
      
      // For alternative attempts, skip previously shown methods and return one at a time
      return filteredMethods.slice(alternativeCount, alternativeCount + 1);
    },
    enabled: !!paymentType && !!selectedClient?.risk_appetite && currentStep === 'payment' && !cosmosAlert
  });

  const resetDialog = () => {
    setCurrentStep('client');
    setSelectedClient(null);
    setOrderAmount(0);
    setCosmosAlert(false);
    setSelectedPaymentMethod(null);
    setPaymentType(null);
    setAlternativeAttempted(false);
    setAlternativeCount(0);
    setNewClientData({
      name: "",
      phone: "",
      email: "",
      platform: "",
      risk_appetite: "HIGH"
    });
  };

  const handleClientSelection = (client: any) => {
    setSelectedClient(client);
    setCurrentStep('amount');
  };

  const handleNewClientCreation = () => {
    if (!newClientData.name || !newClientData.phone) {
      toast({
        title: "Error",
        description: "Please fill in at least name and phone number",
        variant: "destructive",
      });
      return;
    }
    
    const newClient = {
      ...newClientData,
      monthly_limit: null, // Default limit is null for new clients
      current_month_used: 0,
      risk_appetite: "HIGH" // Default risk level is HIGH for new clients
    };
    setSelectedClient(newClient);
    setCurrentStep('amount');
  };

  const handleAmountSubmission = () => {
    if (!orderAmount || orderAmount <= 0) {
      toast({
        title: "Error",
        description: "Please enter a valid order amount",
        variant: "destructive",
      });
      return;
    }

    // Check COSMOS limits only if client has a monthly limit
    const monthlyLimit = selectedClient?.monthly_limit;
    const currentUsed = selectedClient?.current_month_used || 0;
    
    if (monthlyLimit && (currentUsed + orderAmount > monthlyLimit)) {
      setCosmosAlert(true);
      toast({
        title: "COSMOS Alert Triggered",
        description: "Order amount exceeds client's monthly limit. Alert sent to assistant manager.",
        variant: "destructive",
      });
      // Don't proceed to payment step when COSMOS alert is triggered
      return;
    }
    
    setCurrentStep('payment');
  };

  const handlePaymentMethodSelection = (method: any) => {
    setSelectedPaymentMethod(method);
  };

  const handleOrderCancellation = () => {
    toast({
      title: "Order Cancelled",
      description: "Order has been moved to leads for future follow-up",
    });
    onOpenChange(false);
    resetDialog();
  };

  const handleAlternativePayment = () => {
    setAlternativeCount(prev => prev + 1);
    setSelectedPaymentMethod(null);
    // Keep the same payment type but fetch next alternative method
  };

  const handlePaymentReceived = () => {
    if (onSalesEntryOpen) {
      const salesData = {
        customerName: selectedClient?.name || '',
        amount: orderAmount,
        paymentMethod: selectedPaymentMethod,
        clientPhone: selectedClient?.phone || '',
        clientEmail: selectedClient?.email || '',
        platform: selectedClient?.platform || newClientData.platform
      };
      onSalesEntryOpen(salesData);
    }
    setCurrentStep('completion');
  };

  const getAvailableLimit = (method: any) => {
    return method.payment_limit - (method.current_usage || 0);
  };

  // Auto-select the first available payment method when type is chosen
  useEffect(() => {
    if (paymentMethods && paymentMethods.length > 0 && !selectedPaymentMethod && paymentType && !cosmosAlert) {
      const firstMethod = paymentMethods[0];
      setSelectedPaymentMethod(firstMethod);
    }
  }, [paymentMethods, selectedPaymentMethod, paymentType, cosmosAlert]);

  if (!orderType) return null;

  return (
    <Dialog open={open} onOpenChange={(open) => {
      onOpenChange(open);
      if (!open) resetDialog();
    }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {orderType === 'repeat' ? 'Repeat Order' : 'New Client Order'} - Step {
              currentStep === 'client' ? '1' : 
              currentStep === 'amount' ? '2' : 
              currentStep === 'payment' ? '3' : '4'
            }
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Client Selection */}
        {currentStep === 'client' && (
          <div className="space-y-4">
            {orderType === 'repeat' ? (
              <div>
                <Label>Select Existing Client</Label>
                <Select onValueChange={(clientId) => {
                  const client = clients?.find(c => c.id === clientId);
                  if (client) handleClientSelection(client);
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Search by name, ID, or platform" />
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
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name">Client Name *</Label>
                    <Input
                      id="name"
                      value={newClientData.name}
                      onChange={(e) => setNewClientData(prev => ({ ...prev, name: e.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone">Phone *</Label>
                    <Input
                      id="phone"
                      value={newClientData.phone}
                      onChange={(e) => setNewClientData(prev => ({ ...prev, phone: e.target.value }))}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={newClientData.email}
                      onChange={(e) => setNewClientData(prev => ({ ...prev, email: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="platform">Platform</Label>
                    <Select value={newClientData.platform} onValueChange={(value) => 
                      setNewClientData(prev => ({ ...prev, platform: value }))
                    }>
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

                <div>
                  <Label htmlFor="risk">Risk Appetite</Label>
                  <Select value={newClientData.risk_appetite} onValueChange={(value) => 
                    setNewClientData(prev => ({ ...prev, risk_appetite: value }))
                  }>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Low Risk</SelectItem>
                      <SelectItem value="MEDIUM">Medium Risk</SelectItem>
                      <SelectItem value="HIGH">High Risk</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button onClick={handleNewClientCreation} className="w-full">
                  Create Client & Continue
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Amount Entry */}
        {currentStep === 'amount' && (
          <div className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-medium">Selected Client: {selectedClient?.name}</h3>
              <p className="text-sm text-gray-600">
                Risk Level: {selectedClient?.risk_appetite} | 
                Monthly Limit: {selectedClient?.monthly_limit ? `₹${selectedClient.monthly_limit.toLocaleString()}` : 'No Limit'} | 
                Used: ₹{selectedClient?.current_month_used?.toLocaleString() || '0'}
              </p>
            </div>

            <div>
              <Label htmlFor="amount">Order Amount *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                value={orderAmount}
                onChange={(e) => setOrderAmount(parseFloat(e.target.value) || 0)}
                placeholder="Enter order amount"
              />
            </div>

            {cosmosAlert && (
              <div className="space-y-4">
                <Alert className="border-red-200 bg-red-50">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-800">
                    <strong>COSMOS Limit Breached:</strong> Order is pending for approval. 
                    The order amount exceeds the client's monthly limit and requires assistant manager approval.
                  </AlertDescription>
                </Alert>
                
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setCurrentStep('client')}>
                    Back
                  </Button>
                  <Button variant="destructive" onClick={handleOrderCancellation} className="flex-1">
                    Cancel Order
                  </Button>
                </div>
              </div>
            )}

            {!cosmosAlert && (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setCurrentStep('client')}>
                  Back
                </Button>
                <Button onClick={handleAmountSubmission} className="flex-1">
                  Continue to Payment Method
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Payment Method Selection */}
        {currentStep === 'payment' && !cosmosAlert && (
          <div className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-medium">Order Amount: ₹{orderAmount.toLocaleString()}</h3>
              <p className="text-sm text-gray-600">
                Client: {selectedClient?.name} | Risk Level: {selectedClient?.risk_appetite}
              </p>
            </div>

            {!paymentType ? (
              <div className="space-y-4">
                <Label>Choose Payment Method Type</Label>
                <div className="grid grid-cols-2 gap-4">
                  <Card className="cursor-pointer hover:shadow-md transition-shadow"
                        onClick={() => setPaymentType('UPI')}>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2">
                        <CreditCard className="h-5 w-5 text-blue-600" />
                        UPI Payment
                      </CardTitle>
                    </CardHeader>
                  </Card>

                  <Card className="cursor-pointer hover:shadow-md transition-shadow"
                        onClick={() => setPaymentType('Bank Account')}>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2">
                        <Building2 className="h-5 w-5 text-green-600" />
                        Bank Transfer
                      </CardTitle>
                    </CardHeader>
                  </Card>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Available {paymentType === 'Bank Account' ? 'Bank Transfer' : paymentType} Method for {selectedClient?.risk_appetite} Risk Client</Label>
                  <Button variant="outline" size="sm" onClick={() => {
                    setPaymentType(null);
                    setSelectedPaymentMethod(null);
                    setAlternativeCount(0);
                  }}>
                    Change Type
                  </Button>
                </div>

                {paymentMethodsLoading ? (
                  <div className="text-center py-4">Loading payment methods...</div>
                ) : paymentMethods && paymentMethods.length > 0 ? (
                  <div className="space-y-4">
                    {paymentMethods.map((method) => (
                      <Card key={method.id} className={`cursor-pointer transition-all ${
                        selectedPaymentMethod?.id === method.id ? 'ring-2 ring-blue-500' : 'hover:shadow-md'
                      }`} onClick={() => handlePaymentMethodSelection(method)}>
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className="font-medium">
                                {method.type === 'UPI' ? method.upi_id : method.bank_accounts?.account_name}
                              </h4>
                              <p className="text-sm text-gray-600">
                                Risk: {method.risk_category} | Available: ₹{getAvailableLimit(method).toLocaleString()}
                              </p>
                              {method.type === 'Bank Account' && method.bank_accounts && (
                                <p className="text-xs text-gray-500">
                                  Bank: {method.bank_accounts.bank_name}
                                </p>
                              )}
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-medium">
                                ₹{method.payment_limit.toLocaleString()}
                              </div>
                              <div className="text-xs text-gray-500">Limit</div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}

                    {selectedPaymentMethod && (
                      <div className="bg-blue-50 p-4 rounded-lg">
                        <h4 className="font-medium text-blue-900">Selected Payment Method</h4>
                        <p className="text-sm text-blue-700">
                          {selectedPaymentMethod.type === 'UPI' ? 
                            selectedPaymentMethod.upi_id : 
                            selectedPaymentMethod.bank_accounts?.account_name
                          }
                        </p>
                        <p className="text-xs text-blue-600">
                          Risk Category: {selectedPaymentMethod.risk_category} | 
                          Available: ₹{getAvailableLimit(selectedPaymentMethod).toLocaleString()}
                        </p>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button variant="destructive" onClick={handleOrderCancellation}>
                        <XCircle className="h-4 w-4 mr-2" />
                        Cancel Order
                      </Button>
                      <Button variant="outline" onClick={handleAlternativePayment}>
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Alternative Method
                      </Button>
                      <Button 
                        onClick={handlePaymentReceived} 
                        disabled={!selectedPaymentMethod}
                        className="flex-1"
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Payment Received
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    No {paymentType === 'Bank Account' ? 'Bank Transfer' : paymentType} methods available with sufficient limit for {selectedClient?.risk_appetite} risk level clients.
                    <br />
                    <span className="text-sm">Try selecting a different payment type or contact admin to set up payment methods.</span>
                    
                    <div className="flex gap-2 mt-4">
                      <Button variant="destructive" onClick={handleOrderCancellation}>
                        <XCircle className="h-4 w-4 mr-2" />
                        Cancel Order
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 4: Final Sales Entry */}
        {currentStep === 'completion' && (
          <div className="space-y-4">
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                Payment method assigned successfully. Please complete the sales entry.
              </AlertDescription>
            </Alert>

            <div className="bg-gray-50 p-4 rounded-lg space-y-2">
              <div><strong>Client:</strong> {selectedClient?.name}</div>
              <div><strong>Amount:</strong> ₹{orderAmount.toLocaleString()}</div>
              <div><strong>Payment Method:</strong> {
                selectedPaymentMethod?.type === 'UPI' ? 
                selectedPaymentMethod.upi_id : 
                selectedPaymentMethod?.bank_accounts?.account_name
              }</div>
              {cosmosAlert && (
                <div className="text-red-600"><strong>Status:</strong> COSMOS Alert Flagged</div>
              )}
            </div>

            <Button onClick={() => {
              toast({
                title: "Success",
                description: "Order processing completed. Opening full sales entry form.",
              });
              onOpenChange(false);
              resetDialog();
            }} className="w-full">
              Complete Sales Entry
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
