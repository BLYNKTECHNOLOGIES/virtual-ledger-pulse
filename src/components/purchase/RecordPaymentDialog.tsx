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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BuyOrder, calculatePayout } from '@/lib/buy-order-types';
import { getEffectivePanType, hasTdsTypeSelected } from '@/lib/buy-order-helpers';
import { getBuyOrderGrossAmount } from '@/lib/buy-order-amounts';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { Loader2, CreditCard, Upload, Receipt, X, Image, Building2 } from 'lucide-react';
import { recordActionTiming } from '@/lib/purchase-action-timing';
import { logActionWithCurrentUser, ActionTypes, EntityTypes, Modules, getCurrentUserId } from '@/lib/system-action-logger';
import { useAuth } from '@/hooks/useAuth';

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
  const [selectedBankAccountId, setSelectedBankAccountId] = useState('');
  const [screenshotUrl, setScreenshotUrl] = useState('');
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [notes, setNotes] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  // Fetch active bank accounts
  const { data: bankAccounts } = useQuery({
    queryKey: ['bank_accounts_active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('id, account_name, bank_name, balance')
        .eq('status', 'ACTIVE')
        .order('account_name');
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  if (!order) return null;

  // Best-available gross order amount
  const orderAmount = getBuyOrderGrossAmount(order);

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

    // Enforce: Payment cannot be recorded before TDS details exist.
    if (!hasTdsTypeSelected(order)) {
      toast({
        title: 'TDS Required',
        description: 'Please collect TDS/PAN details before recording payment.',
        variant: 'destructive',
      });
      return;
    }

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

    if (!selectedBankAccountId) {
      toast({
        title: 'Bank Account Required',
        description: 'Please select the bank account from which payment is being made',
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

      // Create bank EXPENSE transaction to deduct from bank balance
      // Include created_by (user ID) for audit trail
      const { error: bankTxError } = await supabase
        .from('bank_transactions')
        .insert({
          bank_account_id: selectedBankAccountId,
          transaction_type: 'EXPENSE',
          amount: amount,
          transaction_date: new Date().toISOString().split('T')[0],
          category: 'Purchase',
          description: `Buy Order Payment - ${order.supplier_name || 'Unknown'} - Order #${order.order_number}`,
          reference_number: order.order_number,
          related_account_name: order.supplier_name || null,
          created_by: user?.id || getCurrentUserId() || null, // Persist user ID for audit
        });

      if (bankTxError) throw bankTxError;

      // Update purchase order with the bank account if not already set
      if (!order.bank_account_id) {
        await supabase
          .from('purchase_orders')
          .update({ bank_account_id: selectedBankAccountId })
          .eq('id', order.id);
      }

      // Check if fully paid
      const newTotalPaid = totalPaid + amount;
      const isFullyPaid = newTotalPaid >= payoutInfo.payout - 0.01;

      // Record payment timing
      await recordActionTiming(order.id, 'payment_created', 'payer');
      
      // Log payment action
      await logActionWithCurrentUser({
        actionType: ActionTypes.PURCHASE_PAYMENT_RECORDED,
        entityType: EntityTypes.PURCHASE_ORDER,
        entityId: order.id,
        module: Modules.PURCHASE,
        metadata: { order_number: order.order_number, amount_paid: amount }
      });

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

        // Record payment completion timing
        await recordActionTiming(order.id, 'payment_completed', 'payer');
      }

      toast({
        title: 'Payment Recorded',
        description: isFullyPaid 
          ? `Full payment of ₹${amount.toFixed(2)} recorded. Order moved to Paid status.`
          : `Partial payment of ₹${amount.toFixed(2)} recorded. Remaining: ₹${(remainingAmount - amount).toFixed(2)}`,
      });

      // Reset form
      setAmountPaid('');
      setSelectedBankAccountId('');
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
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-emerald-500" />
            Record Payment
          </DialogTitle>
          <DialogDescription>
            Order #{order.order_number} • {order.supplier_name || 'Unknown Supplier'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Payment Details Card */}
          <div className="p-4 rounded-lg border bg-muted/30 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Receipt className="h-4 w-4" />
              Payment Details
            </div>
            
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Order Amount:</span>
                <p className="font-mono font-semibold">₹{orderAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Net Payable:</span>
                <p className="font-mono font-bold text-lg text-emerald-600">
                  ₹{payoutInfo.payout.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>
            
            {payoutInfo.deductionPercent > 0 ? (
              <div className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                {payoutInfo.deductionPercent}% TDS Applied (-₹{payoutInfo.deduction.toFixed(2)})
              </div>
            ) : (
              <div className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                Non-TDS
              </div>
            )}
          </div>

          {/* Beneficiary Details Card */}
          <div className="p-4 rounded-lg border bg-muted/30 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Building2 className="h-4 w-4" />
              Beneficiary Details
            </div>
            
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-20">Name:</span>
                <span className="font-medium">{order.supplier_name || 'Not specified'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-20">Phone:</span>
                <span className="font-mono">{order.contact_number || 'Not specified'}</span>
              </div>
              {order.upi_id && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground w-20">UPI ID:</span>
                  <span className="font-mono">{order.upi_id}</span>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400">
                    UPI
                  </span>
                </div>
              )}
              {order.bank_account_number && (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-20">A/C No:</span>
                    <span className="font-mono">{order.bank_account_number}</span>
                  </div>
                  {order.ifsc_code && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground w-20">IFSC:</span>
                      <span className="font-mono">{order.ifsc_code}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Already Paid Info */}
          {totalPaid > 0 && (
            <div className="p-3 rounded-lg border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-900/20">
              <div className="flex justify-between items-center text-sm">
                <span className="text-green-700 dark:text-green-400">Already Paid:</span>
                <span className="font-mono font-medium text-green-700 dark:text-green-400">₹{totalPaid.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center mt-1">
                <span className="font-medium">Remaining to Pay:</span>
                <span className="font-mono font-bold text-lg text-orange-600">
                  ₹{remainingAmount.toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {/* Bank Account Selector */}
          <div className="space-y-2">
            <Label htmlFor="bank_account">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Payment From Bank Account *
              </div>
            </Label>
            <Select
              value={selectedBankAccountId}
              onValueChange={setSelectedBankAccountId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select bank account" />
              </SelectTrigger>
              <SelectContent>
                {bankAccounts?.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    <div className="flex flex-col">
                      <span>{account.account_name}</span>
                      <span className="text-xs text-muted-foreground">
                        {account.bank_name} • Balance: ₹{Number(account.balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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