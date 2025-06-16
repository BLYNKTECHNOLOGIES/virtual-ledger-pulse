
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, RefreshCw, CheckCircle } from "lucide-react";

interface OrderActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paymentMethod: any;
  onAction: (action: 'cancelled' | 'alternative' | 'received') => void;
}

export function OrderActionDialog({ 
  open, 
  onOpenChange, 
  paymentMethod,
  onAction 
}: OrderActionDialogProps) {
  const handleAction = (action: 'cancelled' | 'alternative' | 'received') => {
    onAction(action);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Payment Method Assigned</DialogTitle>
          <p className="text-gray-600">
            Payment method has been assigned. What's the status of this order?
          </p>
        </DialogHeader>
        
        {paymentMethod && (
          <div className="p-4 bg-blue-50 rounded-lg mb-4">
            <h4 className="font-medium mb-2">Assigned Payment Method:</h4>
            <div className="text-sm">
              <p><strong>Type:</strong> {paymentMethod.type}</p>
              <p><strong>Details:</strong> {paymentMethod.type === 'UPI' ? paymentMethod.upi_id : paymentMethod.bank_accounts?.account_name}</p>
              <p><strong>Risk Category:</strong> {paymentMethod.risk_category}</p>
            </div>
          </div>
        )}
        
        <div className="grid gap-3">
          <Card 
            className="cursor-pointer hover:bg-red-50 transition-colors border-red-200"
            onClick={() => handleAction('cancelled')}
          >
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-3 text-red-700">
                <AlertTriangle className="h-5 w-5" />
                🔴 Order Cancelled
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">
                Customer decided not to proceed. Move to leads for future follow-up.
              </p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:bg-yellow-50 transition-colors border-yellow-200"
            onClick={() => handleAction('alternative')}
          >
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-3 text-yellow-700">
                <RefreshCw className="h-5 w-5" />
                🟡 Alternative Payment Method
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">
                Customer needs a different payment method. Select another option.
              </p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:bg-green-50 transition-colors border-green-200"
            onClick={() => handleAction('received')}
          >
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-3 text-green-700">
                <CheckCircle className="h-5 w-5" />
                🟢 Payment Received
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">
                Payment has been received successfully. Complete the sales entry.
              </p>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
