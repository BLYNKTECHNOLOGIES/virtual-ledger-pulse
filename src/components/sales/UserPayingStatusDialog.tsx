import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Clock, XCircle, CheckCircle, RefreshCw } from "lucide-react";

interface UserPayingStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientName: string;
  orderAmount: number;
  onStatusChange: (status: string) => void;
  onAlternativeMethod: () => void;
}

export function UserPayingStatusDialog({ 
  open, 
  onOpenChange, 
  clientName,
  orderAmount,
  onStatusChange,
  onAlternativeMethod
}: UserPayingStatusDialogProps) {
  const { toast } = useToast();

  const handleCancelled = () => {
    onStatusChange("ORDER_CANCELLED");
    onOpenChange(false);
    
    toast({
      title: "Order Cancelled",
      description: "Order has been cancelled and moved to leads.",
    });
  };

  const handlePaymentDone = () => {
    onStatusChange("PAYMENT_DONE");
    onOpenChange(false);
  };

  const handleAlternativeMethod = () => {
    onOpenChange(false);
    onAlternativeMethod();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-600" />
            User Payment Status - {clientName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>Order Amount:</strong> ₹{orderAmount.toLocaleString()}
            </p>
            <p className="text-sm text-blue-600 mt-1">
              Status: User is currently paying
            </p>
          </div>

          <div className="space-y-2">
            <Button 
              onClick={handlePaymentDone}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Payment Done
            </Button>
            
            <Button 
              variant="outline" 
              onClick={handleAlternativeMethod}
              className="w-full"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Alternative Method
            </Button>
            
            <Button 
              variant="destructive" 
              onClick={handleCancelled}
              className="w-full"
            >
              <XCircle className="h-4 w-4 mr-2" />
              Cancel Order
            </Button>
          </div>

          <div className="text-center">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}