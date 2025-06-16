
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, CheckCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface OrderAmountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId?: string;
  clientName: string;
  onAmountConfirm: (amount: number, cosmosAlert: boolean) => void;
}

export function OrderAmountDialog({ 
  open, 
  onOpenChange, 
  clientId, 
  clientName,
  onAmountConfirm 
}: OrderAmountDialogProps) {
  const [amount, setAmount] = useState<number>(0);
  const [cosmosAlert, setCosmosAlert] = useState(false);

  // Fetch client limits
  const { data: clientData } = useQuery({
    queryKey: ['client_limits', clientId],
    queryFn: async () => {
      if (!clientId) return null;
      
      const { data, error } = await supabase
        .from('clients')
        .select('monthly_limit, current_month_used, risk_appetite')
        .eq('id', clientId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });

  const handleAmountChange = (value: number) => {
    setAmount(value);
    
    if (clientData) {
      const remainingLimit = (clientData.monthly_limit || 0) - (clientData.current_month_used || 0);
      const willExceedLimit = value > remainingLimit;
      setCosmosAlert(willExceedLimit);
    }
  };

  const handleConfirm = () => {
    onAmountConfirm(amount, cosmosAlert);
  };

  const remainingLimit = clientData 
    ? (clientData.monthly_limit || 0) - (clientData.current_month_used || 0)
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Enter Order Amount</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <Label htmlFor="amount">Order Amount (₹) *</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => handleAmountChange(parseFloat(e.target.value) || 0)}
              placeholder="Enter order amount"
            />
          </div>

          {clientData && (
            <div className="p-3 bg-gray-50 rounded-lg">
              <h4 className="font-medium text-sm mb-2">Client Limit Status</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Monthly Limit:</span>
                  <span>₹{clientData.monthly_limit?.toLocaleString() || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span>Used This Month:</span>
                  <span>₹{clientData.current_month_used?.toLocaleString() || 0}</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span>Available:</span>
                  <span className={remainingLimit < 0 ? "text-red-600" : "text-green-600"}>
                    ₹{remainingLimit.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Risk Level:</span>
                  <span className={`font-medium ${
                    clientData.risk_appetite === 'HIGH' ? 'text-red-600' : 
                    clientData.risk_appetite === 'MEDIUM' ? 'text-yellow-600' : 'text-green-600'
                  }`}>
                    {clientData.risk_appetite}
                  </span>
                </div>
              </div>
            </div>
          )}

          {cosmosAlert && (
            <Alert className="border-red-200 bg-red-50">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                <strong>COSMOS Alert:</strong> This order exceeds the client's monthly limit. 
                Assistant manager approval may be required.
              </AlertDescription>
            </Alert>
          )}

          {!cosmosAlert && amount > 0 && clientData && (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                Order amount is within client limits. Proceed to payment method selection.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleConfirm}
              disabled={amount <= 0}
            >
              Continue to Payment Method
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
