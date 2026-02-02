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
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { BuyOrder, calculatePayout } from '@/lib/buy-order-types';
import { getBuyOrderGrossAmount } from '@/lib/buy-order-amounts';
import { getEffectivePanType } from '@/lib/buy-order-helpers';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Timer, Clock, CreditCard, Banknote, User, Phone, Wallet } from 'lucide-react';
import { recordActionTiming } from '@/lib/purchase-action-timing';
import { logActionWithCurrentUser, ActionTypes, EntityTypes, Modules } from '@/lib/system-action-logger';

interface SetTimerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: BuyOrder | null;
  onSuccess: () => void;
  onPayNow?: () => void;
}

const PRESET_TIMES = [
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '45 min', value: 45 },
  { label: '60 min', value: 60 },
];

export function SetTimerDialog({
  open,
  onOpenChange,
  order,
  onSuccess,
  onPayNow,
}: SetTimerDialogProps) {
  const [loading, setLoading] = useState(false);
  const [customMinutes, setCustomMinutes] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<number | null>(30);
  const { toast } = useToast();

  if (!order) return null;

  // Get payment details
  const effectivePanType = getEffectivePanType(order);
  const grossAmount = getBuyOrderGrossAmount(order);
  const payoutInfo = effectivePanType 
    ? calculatePayout(grossAmount, effectivePanType)
    : { payout: grossAmount, deductionPercent: 0, deduction: 0 };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const getTdsLabel = () => {
    if (!effectivePanType) return null;
    switch (effectivePanType) {
      case 'pan_provided': return '1% TDS';
      case 'pan_not_provided': return '20% TDS';
      case 'non_tds': return 'Non-TDS';
      default: return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const minutes = customMinutes ? parseInt(customMinutes) : selectedPreset;
    if (!minutes || minutes <= 0) {
      toast({
        title: 'Invalid Time',
        description: 'Please enter a valid wait time',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const timerEndAt = new Date();
      timerEndAt.setMinutes(timerEndAt.getMinutes() + minutes);

      const { error } = await supabase
        .from('purchase_orders')
        .update({ 
          order_status: 'added_to_bank',
          timer_end_at: timerEndAt.toISOString()
        })
        .eq('id', order.id);

      if (error) throw error;

      // Record action timing for Add to Bank
      await recordActionTiming(order.id, 'added_to_bank', 'payer');
      
      // Log action for audit trail
      await logActionWithCurrentUser({
        actionType: ActionTypes.PURCHASE_ADDED_TO_BANK,
        entityType: EntityTypes.PURCHASE_ORDER,
        entityId: order.id,
        module: Modules.PURCHASE,
        metadata: { order_number: order.order_number, timer_minutes: minutes }
      });

      toast({
        title: 'Timer Set',
        description: `Order moved to Added to Bank with ${minutes} minute timer`,
      });

      setCustomMinutes('');
      setSelectedPreset(30);
      
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

  const handlePayNow = () => {
    onOpenChange(false);
    if (onPayNow) {
      onPayNow();
    }
  };

  const tdsLabel = getTdsLabel();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5 text-orange-500" />
            Add to Bank
          </DialogTitle>
          <DialogDescription>
            Review payment details and choose to wait or pay immediately.
          </DialogDescription>
        </DialogHeader>

        {/* Payment Details Section */}
        <div className="bg-muted/30 border rounded-lg p-4 space-y-3">
          <h4 className="font-medium text-sm flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            Payment Details
          </h4>
          
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Order Amount:</span>
              <div className="font-semibold">{formatAmount(grossAmount)}</div>
            </div>
            
            {tdsLabel && payoutInfo.deduction > 0 && (
              <div>
                <span className="text-muted-foreground">TDS Deduction ({payoutInfo.deductionPercent}%):</span>
                <div className="font-semibold text-red-600">-{formatAmount(payoutInfo.deduction)}</div>
              </div>
            )}
            
            <div className="col-span-2">
              <span className="text-muted-foreground">Net Payable:</span>
              <div className="font-bold text-lg text-primary">{formatAmount(payoutInfo.payout)}</div>
            </div>
          </div>

          {tdsLabel && (
            <Badge variant="outline" className="text-xs">
              {tdsLabel}
            </Badge>
          )}
        </div>

        {/* Beneficiary Details Section */}
        <div className="bg-muted/30 border rounded-lg p-4 space-y-2">
          <h4 className="font-medium text-sm flex items-center gap-2">
            <User className="h-4 w-4" />
            Beneficiary Details
          </h4>
          
          <div className="space-y-1.5 text-sm">
            {order.supplier_name && (
              <div className="flex items-center gap-2">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{order.supplier_name}</span>
              </div>
            )}
            
            {order.contact_number && (
              <div className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{order.contact_number}</span>
              </div>
            )}
            
            {order.payment_method_type === 'UPI' && order.upi_id && (
              <div className="flex items-center gap-2">
                <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-mono">{order.upi_id}</span>
                <Badge variant="secondary" className="text-xs">UPI</Badge>
              </div>
            )}
            
            {order.payment_method_type !== 'UPI' && order.bank_account_name && (
              <>
                <div className="flex items-center gap-2">
                  <Banknote className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{order.bank_account_name}</span>
                </div>
                {order.bank_account_number && (
                  <div className="flex items-center gap-2 ml-5">
                    <span className="text-muted-foreground">A/C:</span>
                    <span className="font-mono">{order.bank_account_number}</span>
                  </div>
                )}
                {order.ifsc_code && (
                  <div className="flex items-center gap-2 ml-5">
                    <span className="text-muted-foreground">IFSC:</span>
                    <span className="font-mono">{order.ifsc_code}</span>
                  </div>
                )}
              </>
            )}
            
            {!order.upi_id && !order.bank_account_name && (
              <p className="text-muted-foreground italic">No payment details provided</p>
            )}
          </div>
        </div>

        <Separator />

        {/* Timer or Pay Now Section */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Set Wait Time (Optional)
            </Label>
            <div className="grid grid-cols-4 gap-2">
              {PRESET_TIMES.map((preset) => (
                <Button
                  key={preset.value}
                  type="button"
                  variant={selectedPreset === preset.value && !customMinutes ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setSelectedPreset(preset.value);
                    setCustomMinutes('');
                  }}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="custom_minutes">Custom Time (minutes)</Label>
            <Input
              id="custom_minutes"
              type="number"
              placeholder="Enter custom minutes"
              value={customMinutes}
              onChange={(e) => {
                setCustomMinutes(e.target.value);
                if (e.target.value) {
                  setSelectedPreset(null);
                }
              }}
              min={1}
              max={120}
            />
          </div>


          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            
            {onPayNow && (
              <Button
                type="button"
                variant="secondary"
                onClick={handlePayNow}
                disabled={loading}
                className="gap-1"
              >
                <Wallet className="h-4 w-4" />
                Pay Now
              </Button>
            )}
            
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Timer className="h-4 w-4 mr-1" />
              Start Timer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
