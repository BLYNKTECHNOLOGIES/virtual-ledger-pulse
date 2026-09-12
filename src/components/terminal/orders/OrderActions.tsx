import { useEffect, useState, useRef } from 'react';
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
import { CheckCircle, Unlock, XCircle, Shield, Loader2, UserCheck, Fingerprint, Key, Lock } from 'lucide-react';
import { useMarkOrderAsPaid, useReleaseCoin, useCancelOrder, useConfirmOrderVerified, useCheckIfCanRelease } from '@/hooks/useBinanceActions';
import { useSmallTradeBands } from '@/hooks/useSmallTradeBands';
import { isSmallTradeOrder } from '@/lib/small-trade';

import { mapToOperationalStatus } from '@/lib/orderStatusMapper';
import { QuickReceiveDialog, isQuickReceiveEligible } from './QuickReceiveDialog';
import { prepareAutoScreenshot, deliverPreparedAutoScreenshot, triggerAutoReplyForOrder } from '@/lib/triggerAutoScreenshot';
import { toast } from 'sonner';

interface Props {
  orderNumber: string;
  orderStatus: string;
  tradeType: string;
  additionalKycVerify?: number;
  /** Buyer-side Quick Receive: total fiat amount of the order */
  totalPrice?: number | string;
  /** Buyer-side Quick Receive: per-order ceiling returned by Binance order detail */
  quickConfirmAmountUpLimit?: number | string;
  asset?: string;
  fiatUnit?: string;
  advNo?: string;
  /** Account this order belongs to (combined "All accounts" mode). */
  exchangeAccountId?: string;
}

export function OrderActions({
  orderNumber,
  orderStatus,
  tradeType,
  additionalKycVerify,
  totalPrice,
  quickConfirmAmountUpLimit,
  asset,
  fiatUnit,
  advNo,
  exchangeAccountId,
}: Props) {
  const opStatus = mapToOperationalStatus(orderStatus, tradeType);

  if (['Completed', 'Cancelled', 'Expired'].includes(opStatus)) return null;

  const needsVerification = tradeType === 'SELL' && additionalKycVerify === 1;

  // Quick Receive eligibility — strictly BUY + Pending Release + within fiat ceiling.
  // Per Binance SAPI v7.4: confirmPaidType="quick" on releaseCoin lets the buyer auto-release
  // the seller's crypto using our merchant security deposit, capped at quickConfirmAmountUpLimit.
  const quickReceiveEligible =
    tradeType === 'BUY'
    && opStatus === 'Pending Release'
    && totalPrice !== undefined
    && quickConfirmAmountUpLimit !== undefined
    && isQuickReceiveEligible(totalPrice, quickConfirmAmountUpLimit);

  return (
    <div data-order-actions className="pt-3 border-t border-border space-y-2">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Actions</p>

      {needsVerification && opStatus === 'Pending Payment' && (
        <VerifyOrderAction orderNumber={orderNumber} exchangeAccountId={exchangeAccountId} />
      )}

      {tradeType === 'SELL' && additionalKycVerify === 2 && opStatus === 'Pending Payment' && (
        <div className="flex items-center gap-1.5 text-trade-buy bg-trade-buy/5 border border-trade-buy/20 rounded-md px-2.5 py-1.5">
          <UserCheck className="h-3 w-3" />
          <span className="text-[10px] font-medium">Order Verified</span>
        </div>
      )}

      {opStatus === 'Pending Payment' && tradeType === 'BUY' && (
        <MarkAsPaidAction orderNumber={orderNumber} exchangeAccountId={exchangeAccountId} />
      )}

      {opStatus === 'Pending Release' && tradeType === 'SELL' && (
        <ReleaseCoinAction orderNumber={orderNumber} exchangeAccountId={exchangeAccountId} totalPrice={totalPrice} />
      )}


      {/* Quick Receive — only on eligible BUY orders awaiting seller release */}
      {quickReceiveEligible && (
        <QuickReceiveDialog
          orderNumber={orderNumber}
          totalPrice={totalPrice!}
          quickConfirmAmountUpLimit={quickConfirmAmountUpLimit!}
          asset={asset}
          fiatUnit={fiatUnit}
          advNo={advNo}
          exchangeAccountId={exchangeAccountId}
          source="orders"
        />
      )}

      {tradeType === 'BUY' && ['Pending Payment', 'Releasing'].includes(opStatus) && (
        <CancelOrderAction orderNumber={orderNumber} exchangeAccountId={exchangeAccountId} />
      )}
    </div>
  );
}

function VerifyOrderAction({ orderNumber, exchangeAccountId }: { orderNumber: string; exchangeAccountId?: string }) {
  const verifyOrder = useConfirmOrderVerified();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          size="sm"
          className="w-full h-9 text-xs font-medium gap-1.5 rounded-md bg-success/10 text-success border border-success/25 hover:bg-success/15 active:scale-[0.98] transition-transform duration-150"
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
            onClick={() => verifyOrder.mutate({ orderNumber, exchangeAccountId })}
          >
            Confirm & Verify
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function MarkAsPaidAction({ orderNumber, exchangeAccountId }: { orderNumber: string; exchangeAccountId?: string }) {
  const markPaid = useMarkOrderAsPaid();

  const handleConfirmPaid = async () => {
    const preparedScreenshot = await prepareAutoScreenshot(orderNumber);
    await markPaid.mutateAsync({ orderNumber, exchangeAccountId });
    await deliverPreparedAutoScreenshot(preparedScreenshot);
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          size="sm"
          className="w-full h-9 text-xs font-medium gap-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-transform duration-150"
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
          <AlertDialogAction onClick={() => void handleConfirmPaid()}>
            Confirm Paid
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type AuthMethod = 'GOOGLE' | 'YUBIKEY' | 'FUND_PWD';

interface AuthOption {
  value: AuthMethod;
  label: string;
  icon: React.ReactNode;
  placeholder: string;
  fieldName: string;
}

const AUTH_OPTIONS: AuthOption[] = [
  { value: 'GOOGLE', label: 'Google 2FA', icon: <Key className="h-3.5 w-3.5" />, placeholder: 'Enter 6-digit code', fieldName: 'googleVerifyCode' },
  { value: 'YUBIKEY', label: 'YubiKey', icon: <Fingerprint className="h-3.5 w-3.5" />, placeholder: 'Tap your YubiKey…', fieldName: 'yubikeyVerifyCode' },
];

const FUND_PWD_OPTION: AuthOption = {
  value: 'FUND_PWD',
  label: 'Fund Password',
  icon: <Lock className="h-3.5 w-3.5" />,
  placeholder: '',
  fieldName: '',
};

function ReleaseCoinAction({
  orderNumber,
  exchangeAccountId,
  totalPrice,
}: {
  orderNumber: string;
  exchangeAccountId?: string;
  totalPrice?: number | string;
}) {
  const releaseCoin = useReleaseCoin();
  const { data: smallTradeBands } = useSmallTradeBands();
  const [authMethod, setAuthMethod] = useState<AuthMethod>('GOOGLE');
  const [code, setCode] = useState('');
  const [open, setOpen] = useState(false);
  const codeRef = useRef('');

  // Fund-password release exists only for orders inside the small-sales band.
  // Outside the band the option is simply absent — no hint, no disabled entry.
  const fundPwdAllowed = isSmallTradeOrder({ tradeType: 'SELL', totalPrice }, smallTradeBands);
  const authOptions = fundPwdAllowed ? [...AUTH_OPTIONS, FUND_PWD_OPTION] : AUTH_OPTIONS;

  const selectedAuth = authOptions.find(a => a.value === authMethod) ?? AUTH_OPTIONS[0];
  const isFundPwd = selectedAuth.value === 'FUND_PWD';

  const releaseFiredRef = useRef(false);

  // Keep ref in sync so onKeyDown always has the latest value
  const updateCode = (val: string) => {
    setCode(val);
    codeRef.current = val;
  };

  const doRelease = (overrideCode?: string) => {
    if (releaseFiredRef.current || releaseCoin.isPending) return;

    const params: Record<string, any> = { orderNumber, exchangeAccountId };

    if (isFundPwd) {
      // No code is collected or sent: the fund password is applied server-side.
      params.authType = 'FUND_PWD';
    } else {
      const finalCode = overrideCode || codeRef.current;
      if (!finalCode.trim()) return;
      // API doc #29 expects authType + method-specific verification fields.
      // For YubiKey release on this endpoint, sending generic `code` causes
      // "Unsupported authentication type"; send only yubikeyVerifyCode.
      if (authMethod === 'YUBIKEY') {
        params.authType = 'FIDO2';
        params.yubikeyVerifyCode = finalCode;
      } else {
        params.authType = authMethod;
        params.code = finalCode;
        params[selectedAuth.fieldName] = finalCode;
      }
    }

    releaseFiredRef.current = true;

    releaseCoin.mutate(params as any, {
      onSuccess: () => {
        // Fire "Order Released" auto-reply rules immediately after our release.
        triggerAutoReplyForOrder(orderNumber, 'order_released');
        setOpen(false);
        updateCode('');
        releaseFiredRef.current = false;
      },
      onError: () => {
        releaseFiredRef.current = false;
      },
    });
  };

  // Auto-submit for YubiKey when OTP reaches 44 chars (standard Yubico OTP length)
  const handleCodeChange = (val: string) => {
    updateCode(val);
    if (authMethod === 'YUBIKEY' && val.length >= 44 && !releaseFiredRef.current) {
      setTimeout(() => doRelease(val), 100);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setCode(''); releaseFiredRef.current = false; } }}>
      <AlertDialogTrigger asChild>
        <Button
          size="sm"
          className="w-full h-9 text-xs font-medium gap-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-transform duration-150"
          disabled={releaseCoin.isPending}
        >
          {releaseCoin.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unlock className="h-3 w-3" />}
          Release Crypto
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-md bg-popover border-border t-scale-in">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Release Crypto
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isFundPwd
              ? 'Confirm to release crypto to the buyer. No code needed for this method.'
              : 'Choose your authentication method and enter the verification code to release crypto to the buyer.'}
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
                {authOptions.map(opt => (
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

          {/* Verification code input — not used by the fund-password method */}
          {!isFundPwd && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                {selectedAuth.icon}
                {selectedAuth.label} Code
              </Label>
              <div className="flex gap-2">
                <Input
                  id="yubikey-release-input"
                  type="text"
                  placeholder={selectedAuth.placeholder}
                  value={code}
                  onChange={(e) => {
                    handleCodeChange(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.stopPropagation();
                      const val = (e.target as HTMLInputElement).value;
                      if (val.trim()) {
                        setTimeout(() => doRelease(val), 50);
                      }
                    }
                  }}
                  maxLength={authMethod === 'GOOGLE' ? 6 : 200}
                  className={`text-sm ${authMethod === 'GOOGLE' ? 'text-center tracking-widest font-mono text-lg' : 'font-mono text-xs tracking-wide'}`}
                  autoFocus
                  ref={(el) => { if (el) setTimeout(() => el.focus(), 100); }}
                />
              </div>
            </div>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            onClick={() => doRelease()}
            disabled={
              releaseCoin.isPending ||
              (!isFundPwd && (!code.trim() || (authMethod === 'GOOGLE' && code.length < 6)))
            }
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


function CancelOrderAction({ orderNumber, exchangeAccountId }: { orderNumber: string; exchangeAccountId?: string }) {
  const cancelOrder = useCancelOrder();
  const [step, setStep] = useState<0 | 1 | 2>(0); // 0=closed, 1=first confirm, 2=final confirm
  const [reasonCode, setReasonCode] = useState<'4' | '5' | ''>('');
  const [additionalInfo, setAdditionalInfo] = useState('');

  const handleReset = () => { setStep(0); setReasonCode(''); setAdditionalInfo(''); };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="w-full h-9 text-xs font-medium gap-1.5 rounded-md bg-destructive/10 text-destructive border border-destructive/25 hover:bg-destructive/15 active:scale-[0.98] transition-transform duration-150"
        disabled={cancelOrder.isPending}
        onClick={() => setStep(1)}
      >
        {cancelOrder.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
        Cancel Order
      </Button>

      {/* Step 1: First confirmation */}
      <AlertDialog open={step === 1} onOpenChange={(open) => { if (!open) handleReset(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Order #{orderNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this order? This is a sensitive action and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Cancellation reason</Label>
              <Select value={reasonCode} onValueChange={(value) => setReasonCode(value as '4' | '5')}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select reason" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="4">Seller payment method issue</SelectItem>
                  <SelectItem value="5">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Additional note</Label>
              <Input value={additionalInfo} onChange={(e) => setAdditionalInfo(e.target.value)} placeholder="Optional context for audit" maxLength={200} />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleReset}>Keep Order</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              disabled={!reasonCode}
              onClick={(e) => { e.preventDefault(); if (reasonCode) setStep(2); }}
            >
              Yes, Cancel Order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Step 2: Final confirmation */}
      <AlertDialog open={step === 2} onOpenChange={(open) => { if (!open) handleReset(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">⚠️ Final Confirmation</AlertDialogTitle>
            <AlertDialogDescription className="font-medium">
              This is your FINAL confirmation. Order #{orderNumber} will be permanently cancelled. Are you absolutely sure?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleReset}>No, Keep Order</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => { cancelOrder.mutate({ orderNumber, orderCancelReasonCode: Number(reasonCode), orderCancelAdditionalInfo: additionalInfo || undefined, exchangeAccountId }); handleReset(); }}
            >
              Confirm Cancel Order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
