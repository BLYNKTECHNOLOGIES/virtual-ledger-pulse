import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { CheckCircle, Unlock, XCircle, Shield, Loader2 } from 'lucide-react';
import { useMarkOrderAsPaid, useReleaseCoin, useCancelOrder } from '@/hooks/useBinanceActions';

interface Props {
  orderNumber: string;
  orderStatus: string;
  tradeType: string;
}

export function OrderActions({ orderNumber, orderStatus, tradeType }: Props) {
  const status = orderStatus.toUpperCase();
  const isActive = !status.includes('COMPLETED') && !status.includes('CANCEL');
  
  if (!isActive) return null;

  return (
    <div className="pt-3 border-t border-border space-y-2">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Actions</p>
      
      {/* Mark as Paid - available when status is TRADING and we are the buyer */}
      {status.includes('TRADING') && tradeType === 'BUY' && (
        <MarkAsPaidAction orderNumber={orderNumber} />
      )}

      {/* Release Coin - available when BUYER_PAYED and we are the seller */}
      {status.includes('BUYER_PAYED') && tradeType === 'SELL' && (
        <ReleaseCoinAction orderNumber={orderNumber} />
      )}

      {/* Cancel - available in early stages */}
      {(status.includes('TRADING') || status.includes('PENDING')) && (
        <CancelOrderAction orderNumber={orderNumber} />
      )}
    </div>
  );
}

function MarkAsPaidAction({ orderNumber }: { orderNumber: string }) {
  const markPaid = useMarkOrderAsPaid();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          size="sm"
          className="w-full h-8 text-xs gap-1.5 bg-trade-buy hover:bg-trade-buy/90 text-white"
          disabled={markPaid.isPending}
        >
          {markPaid.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
          Mark as Paid
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm Payment</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to mark this order as paid? This will notify the seller that payment has been sent.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => markPaid.mutate({ orderNumber })}>
            Confirm Paid
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ReleaseCoinAction({ orderNumber }: { orderNumber: string }) {
  const releaseCoin = useReleaseCoin();
  const [twoFaCode, setTwoFaCode] = useState('');
  const [open, setOpen] = useState(false);

  const handleRelease = () => {
    releaseCoin.mutate(
      { orderNumber, authType: 'GOOGLE', googleVerifyCode: twoFaCode },
      { onSuccess: () => { setOpen(false); setTwoFaCode(''); } }
    );
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          size="sm"
          className="w-full h-8 text-xs gap-1.5 bg-primary hover:bg-primary/90"
          disabled={releaseCoin.isPending}
        >
          {releaseCoin.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unlock className="h-3 w-3" />}
          Release Crypto
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Release Crypto
          </AlertDialogTitle>
          <AlertDialogDescription>
            Enter your Google Authenticator 2FA code to release the crypto to the buyer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input
          type="text"
          placeholder="Enter 6-digit 2FA code"
          value={twoFaCode}
          onChange={(e) => setTwoFaCode(e.target.value)}
          maxLength={6}
          className="text-center text-lg tracking-widest font-mono"
        />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            onClick={handleRelease}
            disabled={twoFaCode.length < 6 || releaseCoin.isPending}
          >
            {releaseCoin.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : null}
            Release
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function CancelOrderAction({ orderNumber }: { orderNumber: string }) {
  const cancelOrder = useCancelOrder();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="w-full h-8 text-xs gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/5"
          disabled={cancelOrder.isPending}
        >
          {cancelOrder.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
          Cancel Order
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel Order</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to cancel this order? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep Order</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive hover:bg-destructive/90"
            onClick={() => cancelOrder.mutate({ orderNumber })}
          >
            Cancel Order
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
