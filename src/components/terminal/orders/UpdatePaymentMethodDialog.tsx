import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useResolveAlternateUpi } from '@/hooks/usePayerModule';
import { Loader2 } from 'lucide-react';

interface UpdatePaymentMethodDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestId: string;
  orderNumber: string;
}

const PAY_METHODS = ['UPI', 'Paytm', 'PhonePe', 'GPay', 'BHIM', 'Other'];

export function UpdatePaymentMethodDialog({ open, onOpenChange, requestId, orderNumber }: UpdatePaymentMethodDialogProps) {
  const [payMethod, setPayMethod] = useState('UPI');
  const [upiId, setUpiId] = useState('');
  const [verifiedName, setVerifiedName] = useState('');
  const resolve = useResolveAlternateUpi();

  const handleSubmit = async () => {
    if (!upiId.trim()) return;
    await resolve.mutateAsync({
      requestId,
      orderNumber,
      updatedUpiId: upiId.trim(),
      updatedUpiName: verifiedName.trim(),
      updatedPayMethod: payMethod,
    });
    onOpenChange(false);
    setUpiId('');
    setVerifiedName('');
    setPayMethod('UPI');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Update Payment Method</DialogTitle>
          <DialogDescription>
            Provide the alternate UPI details for order <strong className="text-foreground font-mono">{orderNumber}</strong>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-xs">Payment Method</Label>
            <Select value={payMethod} onValueChange={setPayMethod}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAY_METHODS.map(m => (
                  <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">UPI ID <span className="text-destructive">*</span></Label>
            <Input
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              placeholder="example@upi"
              className="h-9 text-xs"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Verified Name</Label>
            <Input
              value={verifiedName}
              onChange={(e) => setVerifiedName(e.target.value)}
              placeholder="Account holder name"
              className="h-9 text-xs"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!upiId.trim() || resolve.isPending}
          >
            {resolve.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
            Update & Resolve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
