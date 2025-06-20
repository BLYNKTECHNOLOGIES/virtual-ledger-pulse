
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { XCircle } from "lucide-react";

interface KYCRequest {
  id: string;
  counterparty_name: string;
  order_amount: number;
}

interface RejectKYCDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: KYCRequest | null;
  onSuccess: () => void;
}

export function RejectKYCDialog({ open, onOpenChange, request, onSuccess }: RejectKYCDialogProps) {
  const [rejectionReason, setRejectionReason] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleReject = async () => {
    if (!request || !rejectionReason.trim()) {
      toast({
        title: "Error",
        description: "Please provide a rejection reason",
        variant: "destructive",
      });
      return;
    }
    
    setLoading(true);
    try {
      const { error } = await supabase
        .from('kyc_approval_requests')
        .update({
          status: 'REJECTED',
          review_date: new Date().toISOString(),
          rejection_reason: rejectionReason.trim()
        })
        .eq('id', request.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "KYC request rejected successfully",
      });

      setRejectionReason('');
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error('Error rejecting KYC request:', error);
      toast({
        title: "Error",
        description: "Failed to reject KYC request",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-600" />
            Reject KYC Request
          </DialogTitle>
        </DialogHeader>

        {request && (
          <div className="space-y-4">
            <div className="bg-red-50 p-4 rounded-lg">
              <h4 className="font-semibold text-red-800">{request.counterparty_name}</h4>
              <p className="text-sm text-red-700">
                Order Amount: ₹{request.order_amount.toLocaleString()}
              </p>
            </div>

            <div>
              <Label htmlFor="rejection-reason">Rejection Reason *</Label>
              <Textarea
                id="rejection-reason"
                placeholder="Please provide a clear reason for rejection..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={4}
                required
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleReject}
                disabled={loading || !rejectionReason.trim()}
                variant="destructive"
              >
                {loading ? 'Rejecting...' : 'Reject KYC'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
