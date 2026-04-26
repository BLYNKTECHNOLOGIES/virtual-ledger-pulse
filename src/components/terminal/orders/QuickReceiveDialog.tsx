import { useEffect, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
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
import { Zap, Loader2, Fingerprint, Key, Smartphone, Shield, Mail } from 'lucide-react';
import { useReleaseCoin, useMarkOrderAsPaid, useCheckIfCanRelease } from '@/hooks/useBinanceActions';
import { logAdAction, AdActionTypes } from '@/hooks/useAdActionLog';
import { prepareAutoScreenshot, deliverPreparedAutoScreenshot } from '@/lib/triggerAutoScreenshot';
import { toast } from 'sonner';

type AuthMethod = 'GOOGLE' | 'YUBIKEY' | 'EMAIL' | 'SMS';

const AUTH_OPTIONS: { value: AuthMethod; label: string; icon: React.ReactNode; placeholder: string; fieldName: string }[] = [
  { value: 'GOOGLE', label: 'Google 2FA', icon: <Key className="h-3.5 w-3.5" />, placeholder: 'Enter 6-digit code', fieldName: 'googleVerifyCode' },
  { value: 'YUBIKEY', label: 'YubiKey', icon: <Fingerprint className="h-3.5 w-3.5" />, placeholder: 'Tap your YubiKey…', fieldName: 'yubikeyVerifyCode' },
  { value: 'EMAIL', label: 'Email OTP', icon: <Mail className="h-3.5 w-3.5" />, placeholder: 'Enter email verification code', fieldName: 'emailVerifyCode' },
  { value: 'SMS', label: 'SMS OTP', icon: <Smartphone className="h-3.5 w-3.5" />, placeholder: 'Enter SMS verification code', fieldName: 'mobileVerifyCode' },
];

export interface QuickReceiveDialogProps {
  orderNumber: string;
  totalPrice: number | string;
  quickConfirmAmountUpLimit: number | string;
  asset?: string;
  fiatUnit?: string;
  advNo?: string;
  source: 'orders' | 'payer';
  /** Called after a successful release */
  onSuccess?: () => void;
  /** Visual size variant */
  variant?: 'block' | 'inline';
  /** When true, will call notifyOrderPaid before releaseCoin (status-1 → status-2 → release) */
  requireMarkPaidFirst?: boolean;
}

/**
 * Eligibility helper exported for use by parents (so they can hide the button entirely
 * when an order isn't eligible for Quick Receive).
 */
export function isQuickReceiveEligible(totalPrice: number | string, quickConfirmAmountUpLimit: number | string): boolean {
  const total = Number(totalPrice);
  const limit = Number(quickConfirmAmountUpLimit);
  if (!Number.isFinite(total) || !Number.isFinite(limit)) return false;
  return limit > 0 && total > 0 && total <= limit;
}

export function QuickReceiveDialog({
  orderNumber,
  totalPrice,
  quickConfirmAmountUpLimit,
  asset,
  fiatUnit,
  advNo,
  source,
  onSuccess,
  variant = 'block',
  requireMarkPaidFirst = false,
}: QuickReceiveDialogProps) {
  const releaseCoin = useReleaseCoin();
  const markPaid = useMarkOrderAsPaid();
  const sendVerifyCode = useCheckIfCanRelease();
  const [open, setOpen] = useState(false);
  const [authMethod, setAuthMethod] = useState<AuthMethod>('GOOGLE');
  const [code, setCode] = useState('');
  const [sendCooldown, setSendCooldown] = useState(0);
  const codeRef = useRef('');
  const firedRef = useRef(false);

  const selectedAuth = AUTH_OPTIONS.find(a => a.value === authMethod)!;
  const canRequestCode = authMethod === 'EMAIL' || authMethod === 'SMS';

  useEffect(() => {
    if (sendCooldown <= 0) return;
    const timer = window.setTimeout(() => setSendCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [sendCooldown]);

  const updateCode = (val: string) => {
    setCode(val);
    codeRef.current = val;
  };

  const handleSendCode = () => {
    if (!canRequestCode || sendVerifyCode.isPending || sendCooldown > 0) return;
    sendVerifyCode.mutate({ orderNumber, authType: authMethod, confirmPaidType: 'quick' }, {
      onSuccess: () => {
        toast.success(`${selectedAuth.label} sent by Binance`);
        setSendCooldown(60);
      },
      onError: (err: Error) => toast.error(`Could not send ${selectedAuth.label}: ${err.message}`),
    });
  };

  const doRelease = async (overrideCode?: string) => {
    const finalCode = overrideCode || codeRef.current;
    if (!finalCode.trim() || firedRef.current || releaseCoin.isPending || markPaid.isPending) return;
    firedRef.current = true;

    // Step 1: if order is still in pending status, notify Binance the buyer paid first
    if (requireMarkPaidFirst) {
      try {
        const preparedScreenshot = await prepareAutoScreenshot(orderNumber);
        await markPaid.mutateAsync({ orderNumber });
        await deliverPreparedAutoScreenshot(preparedScreenshot);
      } catch (err) {
        firedRef.current = false;
        return; // toast surfaced by hook
      }
    }

    const params: Record<string, any> = {
      orderNumber,
      confirmPaidType: 'quick',
    };
    if (authMethod === 'YUBIKEY') {
      params.authType = 'FIDO2';
      params.yubikeyVerifyCode = finalCode;
    } else {
      params.authType = authMethod;
      if (authMethod !== 'EMAIL') params.code = finalCode;
      params[selectedAuth.fieldName] = finalCode;
    }

    releaseCoin.mutate(params as any, {
      onSuccess: () => {
        // Audit log: distinct from regular release
        logAdAction({
          actionType: AdActionTypes.ORDER_QUICK_RECEIVED,
          advNo: advNo || orderNumber,
          adDetails: { orderNumber, asset, fiatUnit },
          metadata: {
            orderNumber,
            confirmPaidType: 'quick',
            totalPrice: Number(totalPrice),
            quickConfirmAmountUpLimit: Number(quickConfirmAmountUpLimit),
            asset,
            fiatUnit,
            authType: params.authType,
            source,
          },
        });
        setOpen(false);
        updateCode('');
        firedRef.current = false;
        onSuccess?.();
      },
      onError: () => {
        firedRef.current = false;
      },
    });
  };

  // Auto-submit YubiKey OTP when reaching 44 chars
  const handleCodeChange = (val: string) => {
    updateCode(val);
    if (authMethod === 'YUBIKEY' && val.length >= 44 && !firedRef.current) {
      setTimeout(() => doRelease(val), 100);
    }
  };

  const triggerClass = variant === 'inline'
    ? 'h-7 text-[10px] gap-1 px-2 bg-amber-500 hover:bg-amber-500/90 text-white border-0'
    : 'w-full h-8 text-xs gap-1.5 bg-amber-500 hover:bg-amber-500/90 text-white border-0';

  return (
    <AlertDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setCode(''); firedRef.current = false; } }}>
      <AlertDialogTrigger asChild>
        <Button
          size="sm"
          className={triggerClass}
          disabled={releaseCoin.isPending}
          title="Quick Receive — auto-release using merchant security deposit"
        >
          {releaseCoin.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
          Quick Receive
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" />
            Quick Receive — Auto-Release
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-xs">
              <p>
                This will <strong>auto-release</strong> the seller's crypto into your wallet using your
                Binance merchant security deposit as collateral. Use only after you have confirmed the
                fiat payment was actually sent.
              </p>
              <div className="rounded-md border border-border bg-muted/30 p-2 space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Order amount</span><span className="font-medium tabular-nums">{Number(totalPrice).toLocaleString('en-IN', { minimumFractionDigits: 2 })} {fiatUnit || 'INR'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Quick Receive limit</span><span className="font-medium tabular-nums">{Number(quickConfirmAmountUpLimit).toLocaleString('en-IN')} {fiatUnit || 'INR'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Asset</span><span className="font-medium">{asset || 'USDT'}</span></div>
              </div>
              <p className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                <Shield className="h-3 w-3" />
                2FA verification required.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Authentication Method</Label>
            <Select value={authMethod} onValueChange={(v) => { setAuthMethod(v as AuthMethod); setCode(''); }}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {AUTH_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    <div className="flex items-center gap-2">{opt.icon}{opt.label}</div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              {selectedAuth.icon}
              {selectedAuth.label} Code
            </Label>
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder={selectedAuth.placeholder}
                value={code}
                onChange={(e) => handleCodeChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    const val = (e.target as HTMLInputElement).value;
                    if (val.trim()) setTimeout(() => doRelease(val), 50);
                  }
                }}
                maxLength={authMethod === 'GOOGLE' ? 6 : authMethod === 'YUBIKEY' ? 200 : 64}
                className={`text-sm ${authMethod === 'GOOGLE' ? 'text-center tracking-widest font-mono text-lg' : authMethod === 'YUBIKEY' ? 'font-mono text-xs tracking-wide' : ''}`}
                autoFocus
              />
              {canRequestCode && (
                <Button type="button" variant="outline" size="sm" className="h-10 shrink-0 text-xs" onClick={handleSendCode} disabled={sendVerifyCode.isPending || sendCooldown > 0}>
                  {sendVerifyCode.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : sendCooldown > 0 ? `${sendCooldown}s` : 'Send'}
                </Button>
              )}
            </div>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            onClick={() => doRelease()}
            disabled={!code.trim() || (authMethod === 'GOOGLE' && code.length < 6) || releaseCoin.isPending}
            className="gap-1.5 bg-amber-500 hover:bg-amber-500/90 text-white"
          >
            {releaseCoin.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
            Quick Receive
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
