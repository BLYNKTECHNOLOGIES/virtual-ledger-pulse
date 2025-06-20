
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle } from "lucide-react";

interface KYCRequest {
  id: string;
  counterparty_name: string;
  order_amount: number;
}

interface ApproveKYCDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: KYCRequest | null;
  onSuccess: () => void;
}

export function ApproveKYCDialog({ open, onOpenChange, request, onSuccess }: ApproveKYCDialogProps) {
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleApprove = async () => {
    if (!request) return;
    
    setLoading(true);
    try {
      const { error } = await supabase
        .from('kyc_approval_requests')
        .update({
          status: 'APPROVED',
          review_date: new Date().toISOString(),
          // Add notes if needed in the future
        })
        .eq('id', request.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "KYC request approved successfully",
      });

      setNotes('');
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error('Error approving KYC request:', error);
      toast({
        title: "Error",
        description: "Failed to approve KYC request",
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
            <CheckCircle className="h-5 w-5 text-green-600" />
            Approve KYC Request
          </DialogTitle>
        </DialogHeader>

        {request && (
          <div className="space-y-4">
            <div className="bg-green-50 p-4 rounded-lg">
              <h4 className="font-semibold text-green-800">{request.counterparty_name}</h4>
              <p className="text-sm text-green-700">
                Order Amount: ₹{request.order_amount.toLocaleString()}
              </p>
            </div>

            <div>
              <Label htmlFor="approval-notes">Approval Notes (Optional)</Label>
              <Textarea
                id="approval-notes"
                placeholder="Add any notes for this approval..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
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
                onClick={handleApprove}
                disabled={loading}
                className="bg-green-600 hover:bg-green-700"
              >
                {loading ? 'Approving...' : 'Approve KYC'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
