import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CheckCircle, Unlock, XCircle, Shield, Loader2, UserCheck, Fingerprint, Key, Mail, Smartphone } from 'lucide-react';
import { useMarkOrderAsPaid, useReleaseCoin, useCancelOrder, useConfirmOrderVerified } from '@/hooks/useBinanceActions';
import { mapToOperationalStatus } from '@/lib/orderStatusMapper';

interface Props {
  orderNumber: string;
  orderStatus: string;
  tradeType: string;
  additionalKycVerify?: number;
}

export function OrderActions({ orderNumber, orderStatus, tradeType, additionalKycVerify }: Props) {
  const opStatus = mapToOperationalStatus(orderStatus, tradeType);

  if (['Completed', 'Cancelled', 'Expired'].includes(opStatus)) return null;

  const needsVerification = tradeType === 'SELL' && additionalKycVerify === 1;

  return (
    <div className="pt-3 border-t border-border space-y-2">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Actions</p>
      
      {needsVerification && opStatus === 'Pending Payment' && (
        <VerifyOrderAction orderNumber={orderNumber} />
      )}

      {tradeType === 'SELL' && additionalKycVerify === 2 && opStatus === 'Pending Payment' && (
        <div className="flex items-center gap-1.5 text-trade-buy bg-trade-buy/5 border border-trade-buy/20 rounded-md px-2.5 py-1.5">
          <UserCheck className="h-3 w-3" />
          <span className="text-[10px] font-medium">Order Verified</span>
        </div>
      )}

      {opStatus === 'Pending Payment' && tradeType === 'BUY' && (
        <MarkAsPaidAction orderNumber={orderNumber} />
      )}

      {opStatus === 'Pending Release' && tradeType === 'SELL' && (
        <ReleaseCoinAction orderNumber={orderNumber} />
      )}

      {opStatus === 'Pending Payment' && tradeType === 'BUY' && (
        <CancelOrderAction orderNumber={orderNumber} />
      )}
    </div>
  );
}

function VerifyOrderAction({ orderNumber }: { orderNumber: string }) {
  const verifyOrder = useConfirmOrderVerified();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          size="sm"
          className="w-full h-8 text-xs gap-1.5 bg-trade-buy hover:bg-trade-buy/90 text-white"
          disabled={verifyOrder.isPending}
        >
          {verifyOrder.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserCheck className="h-3 w-3" />}
          Verify Order
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-trade-buy" />
            Verify Buyer
          </AlertDialogTitle>
          <AlertDialogDescription>
            Verifying this order will share your payment details with the buyer. Only proceed after confirming the buyer's identity.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-trade-buy hover:bg-trade-buy/90"
            onClick={() => verifyOrder.mutate({ orderNumber })}
          >
            Confirm & Verify
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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

type AuthMethod = 'GOOGLE' | 'FIDO2' | 'EMAIL' | 'MOBILE' | 'YUBIKEY';

const AUTH_OPTIONS: { value: AuthMethod; label: string; icon: React.ReactNode; placeholder: string }[] = [
  { value: 'GOOGLE', label: 'Google 2FA', icon: <Key className="h-3.5 w-3.5" />, placeholder: 'Enter 6-digit code' },
  { value: 'FIDO2', label: 'Passkey / FIDO2', icon: <Fingerprint className="h-3.5 w-3.5" />, placeholder: 'Passkey verification code' },
  { value: 'EMAIL', label: 'Email OTP', icon: <Mail className="h-3.5 w-3.5" />, placeholder: 'Enter email verification code' },
  { value: 'MOBILE', label: 'Mobile OTP', icon: <Smartphone className="h-3.5 w-3.5" />, placeholder: 'Enter mobile verification code' },
  { value: 'YUBIKEY', label: 'YubiKey', icon: <Shield className="h-3.5 w-3.5" />, placeholder: 'Enter YubiKey code' },
];

function ReleaseCoinAction({ orderNumber }: { orderNumber: string }) {
  const releaseCoin = useReleaseCoin();
  const [authMethod, setAuthMethod] = useState<AuthMethod>('GOOGLE');
  const [code, setCode] = useState('');
  const [open, setOpen] = useState(false);

  const selectedAuth = AUTH_OPTIONS.find(a => a.value === authMethod)!;

  const handleRelease = () => {
    // API doc #29: releaseCoin expects { orderNumber, authType, code }
    releaseCoin.mutate({
      orderNumber,
      authType: authMethod,
      code,
    }, {
      onSuccess: () => {
        setOpen(false);
        setCode('');
      },
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setCode(''); }}>
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
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Release Crypto
          </AlertDialogTitle>
          <AlertDialogDescription>
            Choose your authentication method and enter the verification code to release crypto to the buyer.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-2">
          {/* Auth method selector */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Authentication Method</Label>
            <Select value={authMethod} onValueChange={(v) => { setAuthMethod(v as AuthMethod); setCode(''); }}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUTH_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    <div className="flex items-center gap-2">
                      {opt.icon}
                      {opt.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Verification code input */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              {selectedAuth.icon}
              {selectedAuth.label} Code
            </Label>
            <Input
              type="text"
              placeholder={selectedAuth.placeholder}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={authMethod === 'GOOGLE' ? 6 : 64}
              className={`text-sm ${authMethod === 'GOOGLE' ? 'text-center tracking-widest font-mono text-lg' : ''}`}
              autoFocus
            />
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            onClick={handleRelease}
            disabled={!code.trim() || (authMethod === 'GOOGLE' && code.length < 6) || releaseCoin.isPending}
            className="gap-1.5"
          >
            {releaseCoin.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unlock className="h-3 w-3" />}
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
