import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, CreditCard, Smartphone, Building } from "lucide-react";

interface PaymentMethodSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderAmount: number;
  counterpartyName: string;
  kycId: string;
  onStatusChange: (status: string, paymentMethodId?: string) => void;
}

interface PaymentMethod {
  id: string;
  type: "UPI" | "Bank Account";
  upi_id?: string;
  bank_accounts?: {
    account_name: string;
    bank_name: string;
    account_number: string;
  };
  risk_category: string;
  payment_limit: number;
  current_usage: number;
  is_active: boolean;
}

export function PaymentMethodSelectionDialog({ 
  open, 
  onOpenChange, 
  orderAmount, 
  counterpartyName,
  kycId,
  onStatusChange 
}: PaymentMethodSelectionDialogProps) {
  const { toast } = useToast();
  const [selectedType, setSelectedType] = useState<"UPI" | "IMPS" | "">("");
  const [selectedMethod, setSelectedMethod] = useState<string>("");
  const [showMethods, setShowMethods] = useState(false);

  // Fetch sales payment methods
  const { data: paymentMethods } = useQuery({
    queryKey: ['sales_payment_methods', selectedType],
    queryFn: async () => {
      if (!selectedType) return [];
      
      const methodType = selectedType === "IMPS" ? "Bank Account" : "UPI";
      
      const { data, error } = await supabase
        .from('sales_payment_methods')
        .select(`
          *,
          bank_accounts:bank_account_id(account_name, bank_name, account_number)
        `)
        .eq('type', methodType)
        .eq('is_active', true)
        .order('risk_category', { ascending: true })
        .order('current_usage', { ascending: true });
      
      if (error) throw error;
      return data as PaymentMethod[];
    },
    enabled: !!selectedType,
  });

  const getAvailableLimit = (method: PaymentMethod) => {
    return method.payment_limit - method.current_usage;
  };

  const getAvailableMethods = () => {
    if (!paymentMethods) return [];
    return paymentMethods.filter(method => getAvailableLimit(method) >= orderAmount);
  };

  const handleTypeSelection = () => {
    if (!selectedType) {
      toast({
        title: "Selection Required",
        description: "Please select a payment method type",
        variant: "destructive",
      });
      return;
    }
    setShowMethods(true);
  };

  const handleUserPaying = () => {
    if (!selectedMethod) {
      toast({
        title: "Selection Required", 
        description: "Please select a payment method",
        variant: "destructive",
      });
      return;
    }
    
    onStatusChange("USER_PAYING", selectedMethod);
    onOpenChange(false);
    
    toast({
      title: "Status Updated",
      description: "Status changed to User Paying. You can continue with other work.",
    });
  };

  const handleOrderCancelled = () => {
    onStatusChange("ORDER_CANCELLED");
    onOpenChange(false);
    
    toast({
      title: "Order Cancelled",
      description: "Order has been cancelled and moved to leads.",
    });
  };

  const handleAlternativeMethod = () => {
    setSelectedMethod("");
    setShowMethods(false);
    setSelectedType("");
  };

  const handlePaymentDone = () => {
    if (!selectedMethod) {
      toast({
        title: "Selection Required",
        description: "Please select a payment method",
        variant: "destructive",
      });
      return;
    }
    
    onStatusChange("PAYMENT_DONE", selectedMethod);
    onOpenChange(false);
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

  const availableMethods = getAvailableMethods();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Payment Processing - {counterpartyName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>Order Amount:</strong> ₹{orderAmount.toLocaleString()}
            </p>
          </div>

          {!showMethods ? (
            <div className="space-y-4">
              <div>
                <Label htmlFor="payment_type">Select Payment Method Type</Label>
                <Select value={selectedType} onValueChange={(value: "UPI" | "IMPS") => setSelectedType(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose payment type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UPI">UPI</SelectItem>
                    <SelectItem value="IMPS">IMPS / Bank Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleTypeSelection} disabled={!selectedType}>
                  Continue
                </Button>
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label>Available {selectedType} Methods</Label>
                {availableMethods.length === 0 ? (
                  <div className="p-4 bg-red-50 rounded-lg">
                    <div className="flex items-center gap-2 text-red-800">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="font-medium">No payment methods available</span>
                    </div>
                    <p className="text-sm text-red-600 mt-1">
                      No {selectedType} methods have sufficient limits for this order amount. 
                      Please contact the finance department.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {availableMethods.map((method) => (
                      <div 
                        key={method.id}
                        className={`p-3 border rounded-lg cursor-pointer hover:bg-gray-50 ${
                          selectedMethod === method.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                        }`}
                        onClick={() => setSelectedMethod(method.id)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {method.type === "UPI" ? (
                              <Smartphone className="h-4 w-4" />
                            ) : (
                              <Building className="h-4 w-4" />
                            )}
                            <div>
                              <p className="font-medium">
                                {method.type === "UPI" 
                                  ? method.upi_id 
                                  : method.bank_accounts?.account_name}
                              </p>
                              {method.type === "Bank Account" && (
                                <p className="text-sm text-gray-500">
                                  {method.bank_accounts?.bank_name} - {method.bank_accounts?.account_number}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <Badge className={getRiskBadgeColor(method.risk_category)}>
                              {method.risk_category}
                            </Badge>
                            <p className="text-sm text-gray-500 mt-1">
                              Available: ₹{getAvailableLimit(method).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {availableMethods.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  <Button 
                    onClick={handleUserPaying}
                    disabled={!selectedMethod}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    User Paying
                  </Button>
                  <Button 
                    onClick={handlePaymentDone}
                    disabled={!selectedMethod}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    Payment Done
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={handleAlternativeMethod}
                  >
                    Alternative Method
                  </Button>
                  <Button 
                    variant="destructive" 
                    onClick={handleOrderCancelled}
                  >
                    Order Cancelled
                  </Button>
                </div>
              )}

              {availableMethods.length === 0 && (
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    onClick={handleAlternativeMethod}
                  >
                    Try Different Type
                  </Button>
                  <Button 
                    variant="destructive" 
                    onClick={handleOrderCancelled}
                  >
                    Cancel Order
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}