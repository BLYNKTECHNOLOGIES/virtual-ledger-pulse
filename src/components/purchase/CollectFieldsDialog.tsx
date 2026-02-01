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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BuyOrder, BuyOrderStatus, COMMON_BANKS, PanType, calculatePayout, STATUS_ORDER } from '@/lib/buy-order-types';
import { validateIFSC, formatIFSCInput } from '@/lib/buy-order-helpers';
import { setPanTypeInNotes } from '@/lib/pan-notes';
import { getBuyOrderGrossAmount } from '@/lib/buy-order-amounts';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Banknote, CreditCard, FileText, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CollectFieldsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: BuyOrder | null;
  collectType: 'banking' | 'pan' | null;
  missingFields: string[];
  targetStatus: BuyOrderStatus;
  onSuccess: () => void;
}

export function CollectFieldsDialog({
  open,
  onOpenChange,
  order,
  collectType,
  missingFields,
  targetStatus,
  onSuccess,
}: CollectFieldsDialogProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    bank_name: '',
    other_bank_name: '',
    account_number: '',
    ifsc_code: '',
    upi_id: '',
    pan_number: '',
  });
  const [panType, setPanType] = useState<PanType>('pan_provided');
  const [ifscError, setIfscError] = useState('');
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;

    const orderAmount = getBuyOrderGrossAmount(order);

    if (collectType === 'banking' && order.payment_method_type !== 'UPI' && formData.ifsc_code) {
      if (!validateIFSC(formData.ifsc_code)) {
        setIfscError('IFSC must be 11 alphanumeric characters');
        return;
      }
    }

    setLoading(true);
    try {
      // STATE PROGRESSION GUARD: Only advance status forward, never revert
      const currentPosition = STATUS_ORDER.indexOf(order.order_status as BuyOrderStatus);
      const targetPosition = STATUS_ORDER.indexOf(targetStatus);
      const shouldUpdateStatus = targetPosition > currentPosition || currentPosition === -1;

      const updateData: Record<string, any> = {};
      
      // Only update status if moving forward (prevents reverting from added_to_bank to pan_collected)
      if (shouldUpdateStatus) {
        updateData.order_status = targetStatus;
      }
      
      if (collectType === 'banking') {
        if (order.payment_method_type === 'UPI') {
          updateData.upi_id = formData.upi_id;
        } else {
          const bankName = formData.bank_name === 'Other' ? formData.other_bank_name : formData.bank_name;
          updateData.bank_account_name = bankName;
          updateData.bank_account_number = formData.account_number;
          updateData.ifsc_code = formData.ifsc_code;
        }
      }

      if (collectType === 'pan') {
        if (panType === 'pan_provided') {
          updateData.pan_number = formData.pan_number;
          updateData.tds_applied = true;
          updateData.tds_amount = orderAmount * 0.01;
          updateData.net_payable_amount = orderAmount - updateData.tds_amount;
        } else if (panType === 'pan_not_provided') {
          updateData.pan_number = null;
          updateData.tds_applied = true;
          updateData.tds_amount = orderAmount * 0.20;
          updateData.net_payable_amount = orderAmount - updateData.tds_amount;
        } else {
          updateData.pan_number = null;
          updateData.tds_applied = false;
          updateData.tds_amount = 0;
          updateData.net_payable_amount = orderAmount;
        }
        updateData.notes = setPanTypeInNotes(order.notes, panType);
      }

      const { error } = await supabase
        .from('purchase_orders')
        .update(updateData)
        .eq('id', order.id);

      if (error) throw error;

      if (collectType === 'pan') {
        const payout = calculatePayout(orderAmount, panType);
        toast({
          title: 'Details Collected',
          description: `Payout: ₹${payout.payout.toLocaleString('en-IN')} (${payout.deductionPercent}% TDS deducted)`,
        });
      } else {
        toast({
          title: 'Details Collected',
          description: `Order updated and moved to ${targetStatus.replace('_', ' ')}`,
        });
      }

      setFormData({
        bank_name: '',
        other_bank_name: '',
        account_number: '',
        ifsc_code: '',
        upi_id: '',
        pan_number: '',
      });
      setPanType('pan_provided');
      setIfscError('');
      
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

  const updateField = (field: string, value: string) => {
    if (field === 'ifsc_code') {
      value = formatIFSCInput(value);
      setIfscError('');
    }
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (!order || !collectType) return null;

  const orderAmount = getBuyOrderGrossAmount(order);
  const payoutInfo = collectType === 'pan' ? calculatePayout(orderAmount, panType) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {collectType === 'banking' ? (
              <>
                {order.payment_method_type === 'UPI' ? (
                  <CreditCard className="h-5 w-5 text-purple-500" />
                ) : (
                  <Banknote className="h-5 w-5 text-purple-500" />
                )}
                Collect Payment Details
              </>
            ) : (
              <>
                <FileText className="h-5 w-5 text-indigo-500" />
                Collect PAN Details
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {collectType === 'pan' 
              ? `Order Amount: ₹${orderAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : `Please enter the ${order.payment_method_type === 'UPI' ? 'UPI' : 'bank'} details for order ${order.order_number}`
            }
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {collectType === 'banking' && order.payment_method_type === 'UPI' && (
            <div className="space-y-2">
              <Label htmlFor="upi_id">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  UPI ID
                </div>
              </Label>
              <Input
                id="upi_id"
                placeholder="example@upi"
                value={formData.upi_id}
                onChange={(e) => updateField('upi_id', e.target.value)}
              />
            </div>
          )}

          {collectType === 'banking' && order.payment_method_type !== 'UPI' && (
            <>
              {missingFields.includes('bank_name') && (
                <div className="space-y-2">
                  <Label htmlFor="bank_name">Bank Name</Label>
                  <Select
                    value={formData.bank_name}
                    onValueChange={(value) => updateField('bank_name', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select bank" />
                    </SelectTrigger>
                    <SelectContent>
                      {COMMON_BANKS.map((bank) => (
                        <SelectItem key={bank} value={bank}>
                          {bank}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {formData.bank_name === 'Other' && (
                    <Input
                      placeholder="Enter bank name"
                      value={formData.other_bank_name}
                      onChange={(e) => updateField('other_bank_name', e.target.value)}
                    />
                  )}
                </div>
              )}

              {missingFields.includes('account_number') && (
                <div className="space-y-2">
                  <Label htmlFor="account_number">Account Number</Label>
                  <Input
                    id="account_number"
                    placeholder="Enter account number"
                    value={formData.account_number}
                    onChange={(e) => updateField('account_number', e.target.value)}
                  />
                </div>
              )}

              {missingFields.includes('ifsc_code') && (
                <div className="space-y-2">
                  <Label htmlFor="ifsc_code">IFSC Code</Label>
                  <Input
                    id="ifsc_code"
                    placeholder="e.g., HDFC0001234"
                    value={formData.ifsc_code}
                    onChange={(e) => updateField('ifsc_code', e.target.value)}
                    className={cn(ifscError && 'border-destructive')}
                    maxLength={11}
                  />
                  {ifscError ? (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {ifscError}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      11 alphanumeric characters (e.g., HDFC0001234)
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {collectType === 'pan' && (
            <div className="space-y-4">
              <RadioGroup
                value={panType}
                onValueChange={(value) => setPanType(value as PanType)}
                className="space-y-3"
              >
                <div className="flex items-start space-x-3 p-3 rounded-lg border bg-green-50 border-green-200">
                  <RadioGroupItem value="pan_provided" id="pan_provided" className="mt-1" />
                  <div className="flex-1">
                    <Label htmlFor="pan_provided" className="font-medium text-green-800">
                      PAN Provided (1% TDS)
                    </Label>
                    <p className="text-xs text-green-600">
                      Deduct 1% from amount, share rest
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3 p-3 rounded-lg border bg-amber-50 border-amber-200">
                  <RadioGroupItem value="pan_not_provided" id="pan_not_provided" className="mt-1" />
                  <div className="flex-1">
                    <Label htmlFor="pan_not_provided" className="font-medium text-amber-800">
                      PAN Not Provided (20% TDS)
                    </Label>
                    <p className="text-xs text-amber-600">
                      Deduct 20% from amount, share rest
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3 p-3 rounded-lg border bg-blue-50 border-blue-200">
                  <RadioGroupItem value="non_tds" id="non_tds" className="mt-1" />
                  <div className="flex-1">
                    <Label htmlFor="non_tds" className="font-medium text-blue-800">
                      Non-TDS Buy
                    </Label>
                    <p className="text-xs text-blue-600">
                      Skip PAN for non-TDS banks & clients
                    </p>
                  </div>
                </div>
              </RadioGroup>

              {panType === 'pan_provided' && (
                <div className="space-y-2">
                  <Label htmlFor="pan_number">PAN Number</Label>
                  <Input
                    id="pan_number"
                    placeholder="e.g., ABCDE1234F"
                    value={formData.pan_number}
                    onChange={(e) => updateField('pan_number', e.target.value.toUpperCase())}
                    maxLength={10}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    10-character alphanumeric PAN
                  </p>
                </div>
              )}

              {/* Payout Summary */}
              {payoutInfo && (
                <div className="p-4 rounded-lg bg-muted border">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-muted-foreground">Order Amount</span>
                    <span className="font-mono">₹{orderAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-muted-foreground">
                      TDS Deduction ({payoutInfo.deductionPercent}%)
                    </span>
                    <span className="font-mono text-destructive">
                      -₹{payoutInfo.deduction.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="border-t pt-2 mt-2">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">Payout Amount</span>
                      <span className="font-mono font-bold text-lg text-green-600">
                        ₹{payoutInfo.payout.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                // Skip without saving - just close dialog and move to next status
                onOpenChange(false);
              }}
              disabled={loading}
            >
              Skip for Now
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save & Continue
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
