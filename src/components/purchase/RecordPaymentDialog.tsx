import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { BuyOrder, calculatePayout } from '@/lib/buy-order-types';
import { getEffectivePanType } from '@/lib/buy-order-helpers';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CreditCard, Upload, Receipt } from 'lucide-react';

interface RecordPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: BuyOrder | null;
  onSuccess: () => void;
}

export function RecordPaymentDialog({
  open,
  onOpenChange,
  order,
  onSuccess,
}: RecordPaymentDialogProps) {
  const [loading, setLoading] = useState(false);
  const [amountPaid, setAmountPaid] = useState('');
  const [screenshotUrl, setScreenshotUrl] = useState('');
  const [notes, setNotes] = useState('');
  const { toast } = useToast();

  if (!order) return null;

  // Calculate remaining amount based on TDS
  const effectivePanType = getEffectivePanType(order);
  const payoutInfo = effectivePanType 
    ? calculatePayout(order.total_amount, effectivePanType)
    : { payout: order.total_amount, deductionPercent: 0, deduction: 0 };
  
  const totalPaid = order.total_paid || 0;
  const remainingAmount = Math.max(0, payoutInfo.payout - totalPaid);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;

    const amount = parseFloat(amountPaid);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: 'Invalid Amount',
        description: 'Please enter a valid payment amount',
        variant: 'destructive',
      });
      return;
    }

    if (amount > remainingAmount) {
      toast({
        title: 'Amount Too High',
        description: `Maximum payable amount is ₹${remainingAmount.toFixed(2)}`,
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      // Record the payment
      const { error: paymentError } = await supabase
        .from('purchase_order_payments')
        .insert({
          order_id: order.id,
          amount_paid: amount,
          screenshot_url: screenshotUrl || null,
          notes: notes || null,
        });

      if (paymentError) throw paymentError;

      // Check if fully paid
      const newTotalPaid = totalPaid + amount;
      const isFullyPaid = newTotalPaid >= payoutInfo.payout - 0.01; // Allow small tolerance

      // Update order status if fully paid
      if (isFullyPaid) {
        const { error: statusError } = await supabase
          .from('purchase_orders')
          .update({ 
            order_status: 'paid',
            payment_proof_url: screenshotUrl || order.payment_proof_url,
          })
          .eq('id', order.id);

        if (statusError) throw statusError;
      }

      toast({
        title: 'Payment Recorded',
        description: isFullyPaid 
          ? `Full payment of ₹${amount.toFixed(2)} recorded. Order moved to Paid status.`
          : `Partial payment of ₹${amount.toFixed(2)} recorded. Remaining: ₹${(remainingAmount - amount).toFixed(2)}`,
      });

      // Reset form
      setAmountPaid('');
      setScreenshotUrl('');
      setNotes('');
      
      onSuccess();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePayFullAmount = () => {
    setAmountPaid(remainingAmount.toFixed(2));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-emerald-500" />
            Record Payment
          </DialogTitle>
          <DialogDescription>
            Order: {order.order_number}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Payment Summary */}
          <div className="p-4 rounded-lg bg-muted border space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Order Amount</span>
              <span className="font-mono">₹{order.total_amount.toLocaleString('en-IN')}</span>
            </div>
            {payoutInfo.deductionPercent > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">
                  TDS ({payoutInfo.deductionPercent}%)
                </span>
                <span className="font-mono text-destructive">
                  -₹{payoutInfo.deduction.toLocaleString('en-IN')}
                </span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Net Payable</span>
              <span className="font-mono font-semibold">₹{payoutInfo.payout.toLocaleString('en-IN')}</span>
            </div>
            {totalPaid > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Already Paid</span>
                <span className="font-mono text-green-600">₹{totalPaid.toFixed(2)}</span>
              </div>
            )}
            <div className="border-t pt-2 mt-2">
              <div className="flex justify-between items-center">
                <span className="font-medium">Remaining</span>
                <span className="font-mono font-bold text-lg text-orange-600">
                  ₹{remainingAmount.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Amount Input */}
          <div className="space-y-2">
            <Label htmlFor="amount_paid">
              <div className="flex items-center gap-2">
                <Receipt className="h-4 w-4" />
                Payment Amount
              </div>
            </Label>
            <div className="flex gap-2">
              <Input
                id="amount_paid"
                type="number"
                step="0.01"
                placeholder="Enter amount"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
                required
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handlePayFullAmount}
              >
                Pay Full
              </Button>
            </div>
          </div>

          {/* Screenshot URL */}
          <div className="space-y-2">
            <Label htmlFor="screenshot_url">
              <div className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Payment Screenshot URL (Optional)
              </div>
            </Label>
            <Input
              id="screenshot_url"
              type="url"
              placeholder="https://..."
              value={screenshotUrl}
              onChange={(e) => setScreenshotUrl(e.target.value)}
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              placeholder="Any additional notes about the payment..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Record Payment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
