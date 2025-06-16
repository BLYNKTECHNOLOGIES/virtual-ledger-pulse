
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CreditCard, Building, AlertTriangle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface PaymentMethodDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientRiskLevel: string;
  orderAmount: number;
  onPaymentMethodSelect: (method: any) => void;
}

export function PaymentMethodDialog({ 
  open, 
  onOpenChange, 
  clientRiskLevel, 
  orderAmount,
  onPaymentMethodSelect 
}: PaymentMethodDialogProps) {
  // Fetch available payment methods based on risk level
  const { data: paymentMethods, isLoading } = useQuery({
    queryKey: ['available_payment_methods', clientRiskLevel, orderAmount],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_payment_methods')
        .select(`
          *,
          bank_accounts:bank_account_id(account_name, bank_name, balance)
        `)
        .eq('is_active', true)
        .eq('risk_category', clientRiskLevel);
      
      if (error) throw error;
      
      // Filter methods that have sufficient limits
      return data?.filter(method => {
        const availableLimit = method.payment_limit - (method.current_usage || 0);
        return availableLimit >= orderAmount;
      }) || [];
    },
  });

  const getUsagePercentage = (current: number, limit: number) => {
    return limit > 0 ? Math.min((current / limit) * 100, 100) : 0;
  };

  const handleMethodSelect = (method: any) => {
    onPaymentMethodSelect(method);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Select Payment Method</DialogTitle>
          <p className="text-gray-600">
            Client Risk Level: <Badge variant="outline">{clientRiskLevel}</Badge> | 
            Order Amount: <strong>₹{orderAmount.toLocaleString()}</strong>
          </p>
        </DialogHeader>
        
        <div className="space-y-4">
          {isLoading ? (
            <div className="text-center py-8">Loading available payment methods...</div>
          ) : paymentMethods && paymentMethods.length > 0 ? (
            <div className="grid gap-4">
              {paymentMethods.map((method) => {
                const availableLimit = method.payment_limit - (method.current_usage || 0);
                const usagePercentage = getUsagePercentage(method.current_usage || 0, method.payment_limit);
                
                return (
                  <Card key={method.id} className="cursor-pointer hover:bg-gray-50 transition-colors">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {method.type === 'UPI' ? (
                            <CreditCard className="h-6 w-6 text-blue-600" />
                          ) : (
                            <Building className="h-6 w-6 text-green-600" />
                          )}
                          <div>
                            <div className="font-medium">
                              {method.type === 'UPI' ? method.upi_id : method.bank_accounts?.account_name}
                            </div>
                            <div className="text-sm text-gray-500">
                              {method.type} • {method.frequency}
                            </div>
                          </div>
                        </div>
                        <Badge className={`${
                          method.risk_category === 'High Risk' ? 'bg-red-100 text-red-800' :
                          method.risk_category === 'Medium Risk' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {method.risk_category}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {method.type === 'Bank Account' && method.bank_accounts && (
                        <div className="mb-3 p-2 bg-gray-50 rounded">
                          <div className="flex justify-between items-center text-sm">
                            <span>{method.bank_accounts.bank_name}</span>
                            <span className="font-medium text-green-600">
                              ₹{method.bank_accounts.balance.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      )}
                      
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Usage Limit</span>
                          <span>₹{method.current_usage?.toLocaleString() || 0} / ₹{method.payment_limit.toLocaleString()}</span>
                        </div>
                        <Progress value={usagePercentage} className="h-2" />
                        <div className="flex justify-between text-sm">
                          <span className="text-green-600">Available: ₹{availableLimit.toLocaleString()}</span>
                          <span className="text-gray-500">Frequency: {method.frequency}</span>
                        </div>
                      </div>
                      
                      <Button 
                        className="w-full mt-3" 
                        onClick={() => handleMethodSelect(method)}
                      >
                        Select This Method
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No Payment Methods Available</h3>
              <p className="text-gray-600 mb-4">
                No active payment methods found for this risk level and order amount.
                Please check the BAMS configuration or contact your administrator.
              </p>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Go Back
              </Button>
            </div>
          )}
          
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
