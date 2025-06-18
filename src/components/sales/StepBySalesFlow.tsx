
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SalesEntryDialog } from "./SalesEntryDialog";
import { AlertCircle, CreditCard } from "lucide-react";

interface StepBySalesFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StepBySalesFlow({ open, onOpenChange }: StepBySalesFlowProps) {
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<any>(null);
  const [showSalesEntry, setShowSalesEntry] = useState(false);
  const [showNoMethodsDialog, setShowNoMethodsDialog] = useState(false);

  // Fetch active sales payment methods
  const { data: paymentMethods, isLoading } = useQuery({
    queryKey: ['sales_payment_methods'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_payment_methods')
        .select('*, bank_accounts(bank_name, account_name)')
        .eq('is_active', true);
      
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const handlePaymentMethodSelect = (method: any) => {
    setSelectedPaymentMethod(method);
    setShowSalesEntry(true);
    onOpenChange(false);
  };

  const handleNoMethodsOkay = () => {
    setShowNoMethodsDialog(false);
    onOpenChange(false);
  };

  // Check if we should show no methods dialog
  const shouldShowNoMethods = !isLoading && paymentMethods && paymentMethods.length === 0;

  if (shouldShowNoMethods && !showNoMethodsDialog) {
    setShowNoMethodsDialog(true);
  }

  return (
    <>
      <Dialog open={open && !showSalesEntry} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Select Payment Method for Sales Order</DialogTitle>
          </DialogHeader>
          
          {isLoading ? (
            <div className="text-center py-8">Loading payment methods...</div>
          ) : paymentMethods && paymentMethods.length > 0 ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Choose a payment method to process the sales order:
              </p>
              
              <div className="grid gap-4">
                {paymentMethods.map((method) => (
                  <Card 
                    key={method.id} 
                    className="cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => handlePaymentMethodSelect(method)}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <CreditCard className="h-5 w-5" />
                          {method.type}
                        </CardTitle>
                        <Badge variant={method.risk_category === 'LOW' ? 'default' : 
                                     method.risk_category === 'MEDIUM' ? 'secondary' : 'destructive'}>
                          {method.risk_category} Risk
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        {method.bank_accounts && (
                          <div>
                            <span className="font-medium">Bank:</span> {method.bank_accounts.bank_name}
                          </div>
                        )}
                        {method.upi_id && (
                          <div>
                            <span className="font-medium">UPI ID:</span> {method.upi_id}
                          </div>
                        )}
                        <div>
                          <span className="font-medium">Limit:</span> ₹{Number(method.payment_limit).toLocaleString()}
                        </div>
                        <div>
                          <span className="font-medium">Used:</span> ₹{Number(method.current_usage || 0).toLocaleString()}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* No Methods Available Dialog */}
      <Dialog open={showNoMethodsDialog} onOpenChange={setShowNoMethodsDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-500" />
              No Payment Methods Available
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <p className="text-gray-600">
              No available payment methods found. Please contact your administrator to configure payment methods.
            </p>
            
            <div className="flex justify-end">
              <Button onClick={handleNoMethodsOkay}>
                Okay
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sales Entry Dialog */}
      <SalesEntryDialog
        open={showSalesEntry}
        onOpenChange={setShowSalesEntry}
        preFilledData={{
          paymentMethod: selectedPaymentMethod,
          platform: selectedPaymentMethod?.platform || ""
        }}
      />
    </>
  );
}
