import { useState, useRef } from 'react';
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
import { Loader2, CreditCard, Upload, Receipt, X, Image } from 'lucide-react';

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
  const [uploading, setUploading] = useState(false);
  const [amountPaid, setAmountPaid] = useState('');
  const [screenshotUrl, setScreenshotUrl] = useState('');
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [notes, setNotes] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  if (!order) return null;

  // Get the actual order amount - use net_amount if available, otherwise calculate
  const orderAmount = order.total_amount || 
    (order.quantity && order.price_per_unit ? order.quantity * order.price_per_unit : 0);

  // Calculate remaining amount based on TDS
  const effectivePanType = getEffectivePanType(order);
  const payoutInfo = effectivePanType 
    ? calculatePayout(orderAmount, effectivePanType)
    : { payout: orderAmount, deductionPercent: 0, deduction: 0 };
  
  const totalPaid = order.total_paid || 0;
  const remainingAmount = Math.max(0, payoutInfo.payout - totalPaid);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid File',
        description: 'Please upload an image file (PNG, JPG, etc.)',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'File Too Large',
        description: 'Maximum file size is 5MB',
        variant: 'destructive',
      });
      return;
    }

    setScreenshotFile(file);
  };

  const uploadScreenshot = async (): Promise<string | null> => {
    if (!screenshotFile || !order) return null;

    setUploading(true);
    try {
      const fileExt = screenshotFile.name.split('.').pop();
      const fileName = `${order.id}_${Date.now()}.${fileExt}`;
      const filePath = `payment-receipts/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, screenshotFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (error: any) {
      console.error('Upload error:', error);
      toast({
        title: 'Upload Failed',
        description: 'Failed to upload screenshot. Payment will be recorded without it.',
        variant: 'destructive',
      });
      return null;
    } finally {
      setUploading(false);
    }
  };

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

    if (amount > remainingAmount + 0.01) {
      toast({
        title: 'Amount Too High',
        description: `Maximum payable amount is ₹${remainingAmount.toFixed(2)}`,
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      // Upload screenshot if provided
      let uploadedUrl: string | null = null;
      if (screenshotFile) {
        uploadedUrl = await uploadScreenshot();
      }

      // Record the payment
      const { error: paymentError } = await supabase
        .from('purchase_order_payments')
        .insert({
          order_id: order.id,
          amount_paid: amount,
          screenshot_url: uploadedUrl || null,
          notes: notes || null,
        });

      if (paymentError) throw paymentError;

      // Check if fully paid
      const newTotalPaid = totalPaid + amount;
      const isFullyPaid = newTotalPaid >= payoutInfo.payout - 0.01;

      // Update order status if fully paid
      if (isFullyPaid) {
        const { error: statusError } = await supabase
          .from('purchase_orders')
          .update({ 
            order_status: 'paid',
            payment_proof_url: uploadedUrl || order.payment_proof_url,
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
      setScreenshotFile(null);
      setNotes('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
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

  const removeScreenshot = () => {
    setScreenshotFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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
              <span className="font-mono font-medium">₹{orderAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            {payoutInfo.deductionPercent > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">
                  TDS ({payoutInfo.deductionPercent}%)
                </span>
                <span className="font-mono text-destructive">
                  -₹{payoutInfo.deduction.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Net Payable</span>
              <span className="font-mono font-semibold">₹{payoutInfo.payout.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
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

          {/* Screenshot Upload */}
          <div className="space-y-2">
            <Label>
              <div className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Payment Screenshot
              </div>
            </Label>
            
            {screenshotFile ? (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted border">
                <Image className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm flex-1 truncate">{screenshotFile.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={removeScreenshot}
                  className="h-8 w-8 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors"
              >
                <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Click to upload receipt
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  PNG, JPG up to 5MB
                </p>
              </div>
            )}
            
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
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
              disabled={loading || uploading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading || uploading}>
              {(loading || uploading) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {uploading ? 'Uploading...' : 'Record Payment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}