import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, Building, Copy, Clock, CheckCircle } from "lucide-react";

interface PaymentMethodSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderAmount: number;
  clientName: string;
  orderId: string;
  riskCategory: string;
  paymentType: 'UPI' | 'Bank Transfer';
  onStatusChange: (status: string, paymentMethodId?: string) => void;
}

export function PaymentMethodSelectionDialog({ 
  open, 
  onOpenChange, 
  orderAmount,
  clientName,
  orderId,
  riskCategory,
  paymentType,
  onStatusChange
}: PaymentMethodSelectionDialogProps) {
  const { toast } = useToast();
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<any>(null);

  // Fetch available payment methods
  const { data: paymentMethods, isLoading } = useQuery({
    queryKey: ['sales_payment_methods', riskCategory, paymentType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_payment_methods')
        .select(`
          *,
          bank_accounts:bank_account_id(
            account_name,
            bank_name,
            account_number,
            IFSC,
            bank_account_holder_name
          )
        `)
        .eq('is_active', true)
        .eq('risk_category', riskCategory)
        .eq('type', paymentType === 'UPI' ? 'UPI' : 'Bank Account');

      if (error) throw error;
      
      // Filter methods that have available capacity
      const filteredData = (data || []).filter(method => 
        method.current_usage < method.payment_limit
      );
      
      return filteredData;
    },
    enabled: open
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: "Payment details copied to clipboard" });
  };

  const handleUserPaying = () => {
    if (!selectedPaymentMethod) {
      toast({ title: "Error", description: "Please select a payment method", variant: "destructive" });
      return;
    }
    onStatusChange("USER_PAYING", selectedPaymentMethod.id);
    onOpenChange(false);
  };

  const handlePaymentDone = () => {
    if (!selectedPaymentMethod) {
      toast({ title: "Error", description: "Please select a payment method", variant: "destructive" });
      return;
    }
    onStatusChange("PAYMENT_DONE", selectedPaymentMethod.id);
    onOpenChange(false);
  };

  const renderPaymentMethodCard = (method: any) => (
    <Card 
      key={method.id}
      className={`cursor-pointer transition-all ${
        selectedPaymentMethod?.id === method.id ? 'ring-2 ring-blue-500' : 'hover:shadow-md'
      }`}
      onClick={() => setSelectedPaymentMethod(method)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            {method.type === 'UPI' ? (
              <CreditCard className="h-4 w-4 text-purple-600" />
            ) : (
              <Building className="h-4 w-4 text-blue-600" />
            )}
            <span className="font-medium">
              {method.bank_accounts ? method.bank_accounts.account_name : method.type}
            </span>
          </div>
          <Badge variant="outline" className="text-green-600">
            Available: ₹{(method.payment_limit - method.current_usage).toLocaleString()}
          </Badge>
        </div>

        {method.type === 'UPI' && method.upi_id && (
          <div className="space-y-1">
            <div className="text-sm text-gray-600">UPI ID</div>
            <div className="flex items-center justify-between bg-gray-50 p-2 rounded">
              <span className="font-mono text-sm">{method.upi_id}</span>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={(e) => {
                  e.stopPropagation();
                  copyToClipboard(method.upi_id);
                }}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}

        {method.type === 'Bank Account' && method.bank_accounts && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-gray-600">Bank:</span>
                <p className="font-medium">{method.bank_accounts.bank_name}</p>
              </div>
              <div>
                <span className="text-gray-600">Account:</span>
                <div className="flex items-center gap-1">
                  <span className="font-mono">{method.bank_accounts.account_number}</span>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={(e) => {
                      e.stopPropagation();
                      copyToClipboard(method.bank_accounts.account_number);
                    }}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div>
                <span className="text-gray-600">IFSC:</span>
                <div className="flex items-center gap-1">
                  <span className="font-mono">{method.bank_accounts.IFSC}</span>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={(e) => {
                      e.stopPropagation();
                      copyToClipboard(method.bank_accounts.IFSC);
                    }}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div>
                <span className="text-gray-600">Name:</span>
                <p className="font-medium">{method.bank_accounts.bank_account_holder_name}</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Select Payment Method - {clientName} (₹{orderAmount.toLocaleString()})
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {isLoading ? (
            <div className="text-center py-8">Loading payment methods...</div>
          ) : paymentMethods && paymentMethods.length > 0 ? (
            <div className="space-y-3">
              {paymentMethods.map(renderPaymentMethodCard)}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No available payment methods found for this risk category and type.
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleUserPaying}
              disabled={!selectedPaymentMethod}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Clock className="h-4 w-4 mr-2" />
              User Paying
            </Button>
            <Button 
              onClick={handlePaymentDone}
              disabled={!selectedPaymentMethod}
              className="bg-green-600 hover:bg-green-700"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Payment Done
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}