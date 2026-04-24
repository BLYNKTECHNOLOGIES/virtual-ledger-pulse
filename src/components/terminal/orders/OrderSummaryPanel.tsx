import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { User, Clock, CreditCard, Hash, Timer, AlertTriangle, RefreshCw } from 'lucide-react';
import { P2POrderRecord } from '@/hooks/useP2PTerminal';
import { CounterpartyBadge } from './CounterpartyBadge';
import { PaymentDetailsCard } from './PaymentDetailsCard';
import { OrderActions } from './OrderActions';
import { UpdatePaymentMethodDialog } from './UpdatePaymentMethodDialog';
import { format } from 'date-fns';
import { mapToOperationalStatus, getStatusStyle } from '@/lib/orderStatusMapper';
import { useState, useEffect } from 'react';
import { useAlternateUpiRequest } from '@/hooks/usePayerModule';
import { useTerminalAuth } from '@/hooks/useTerminalAuth';

interface Props {
  order: P2POrderRecord;
  counterpartyVerifiedName?: string;
  liveDetail?: any;
}

export function OrderSummaryPanel({ order, counterpartyVerifiedName, liveDetail }: Props) {
  const { hasPermission, isTerminalAdmin } = useTerminalAuth();
  const canActions = hasPermission('terminal_orders_actions') || isTerminalAdmin;
  const tradeColor = order.trade_type === 'BUY' ? 'text-trade-buy' : 'text-trade-sell';
  const tradeBg = order.trade_type === 'BUY' ? 'bg-trade-buy/10' : 'bg-trade-sell/10';

  // Finalized states from live detail outrank stale cached active states.
  // Binance numeric: 5=COMPLETED, 6/7=CANCELLED.
  const liveStatusRaw = liveDetail?.orderStatus;
  const numToCanonical: Record<number, string> = {
    1: 'PENDING', 2: 'TRADING', 3: 'BUYER_PAYED', 4: 'BUYER_PAYED',
    5: 'COMPLETED', 6: 'CANCELLED', 7: 'CANCELLED', 8: 'APPEAL',
  };
  const liveStatusCanonical = (() => {
    if (liveStatusRaw === undefined || liveStatusRaw === null) return null;
    if (typeof liveStatusRaw === 'number') return numToCanonical[liveStatusRaw] || null;
    const s = String(liveStatusRaw).trim();
    if (/^\d+$/.test(s)) return numToCanonical[Number(s)] || null;
    return s.toUpperCase();
  })();
  const liveIsFinalized = liveStatusCanonical
    ? ['COMPLETED', 'CANCELLED', 'EXPIRED'].some(t => liveStatusCanonical.includes(t))
    : false;
  const effectiveRawStatus = liveIsFinalized ? (liveStatusCanonical as string) : order.order_status;

  const opStatus = mapToOperationalStatus(effectiveRawStatus, order.trade_type);
  const isTerminal = ['Completed', 'Cancelled', 'Expired'].includes(opStatus);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);

  // Alternate UPI request
  const { data: altUpiRequest } = useAlternateUpiRequest(order.binance_order_number);
  const hasPendingAltUpi = altUpiRequest?.status === 'pending';

  const notifyPayEndTimeMs = liveDetail?.notifyPayEndTime;
  const notifyPayedExpireMinute = liveDetail?.notifyPayedExpireMinute;
  const createTimeMs = order.binance_create_time
    ? new Date(order.binance_create_time).getTime()
    : null;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <Badge className={`${tradeBg} ${tradeColor} border-0 text-xs font-semibold`}>
            {order.trade_type}
          </Badge>
          <CounterpartyBadge
            isRepeat={order.is_repeat_client}
            repeatCount={order.repeat_order_count}
            tradeType={order.trade_type}
          />
        </div>
        <h2 className="text-lg font-bold text-foreground tabular-nums">
          ₹{Number(order.total_price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {Number(order.amount).toFixed(4)} {order.asset} @ ₹{Number(order.unit_price).toLocaleString('en-IN')}
        </p>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        <InfoRow icon={Hash} label="Order ID" value={order.binance_order_number} mono />
        <InfoRow icon={User} label="Counterparty" value={order.counterparty_nickname} />
        {counterpartyVerifiedName && (
          <InfoRow icon={User} label="Verified Name" value={counterpartyVerifiedName} />
        )}
        {order.pay_method_name && (
          <InfoRow icon={CreditCard} label="Payment" value={order.pay_method_name} />
        )}
        <InfoRow
          icon={Clock}
          label="Created"
          value={order.binance_create_time
            ? format(new Date(order.binance_create_time), 'dd MMM yyyy, HH:mm')
            : '—'}
        />

        {/* Countdown timer for active orders — uses notifyPayEndTime from Binance (the actual full payment deadline) */}
        {!isTerminal && notifyPayEndTimeMs && (
          <CountdownTimer expiryTime={notifyPayEndTimeMs} payTimeLimitMinutes={notifyPayedExpireMinute} />
        )}

        {/* Fallback: countdown from notifyPayedExpireMinute if no notifyPayEndTime */}
        {!isTerminal && !notifyPayEndTimeMs && createTimeMs && notifyPayedExpireMinute && (
          <CountdownTimer expiryTime={createTimeMs + notifyPayedExpireMinute * 60 * 1000} payTimeLimitMinutes={notifyPayedExpireMinute} />
        )}

        {/* Fallback: elapsed timer if nothing available */}
        {createTimeMs && !isTerminal && !notifyPayEndTimeMs && !notifyPayedExpireMinute && (
          <ElapsedTimer createTime={createTimeMs} />
        )}

        {/* Alternate UPI Request Alert */}
        {hasPendingAltUpi && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-xs font-medium text-amber-500">Alternate UPI Requested</span>
            </div>
            <p className="text-[10px] text-muted-foreground">Payer has requested an alternate UPI for this order.</p>
            <Button
              size="sm"
              className="h-7 text-[10px] w-full"
              onClick={() => setShowUpdateDialog(true)}
            >
              Update Payment Method
            </Button>
          </div>
        )}

        {/* Payment details for BUY orders — shows seller's bank/UPI details */}
        {order.trade_type === 'BUY' && liveDetail?.payMethods && (
          <PaymentDetailsCard
            payMethods={liveDetail.payMethods}
            totalPrice={order.total_price?.toString() || liveDetail.totalPrice || '0'}
            fiatSymbol={liveDetail.fiatSymbol || '₹'}
          />
        )}

        {/* Status */}
        <div className="pt-3 border-t border-border">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Status</p>
          {(() => {
            const style = getStatusStyle(opStatus);
            return (
              <Badge variant="outline" className={`text-xs ${style.badgeClass}`}>
                {style.label}
              </Badge>
            );
          })()}
        </div>

        {/* Ad reference */}
        {order.binance_adv_no && (
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Ad Reference</p>
            <p className="text-xs text-foreground font-mono">{order.binance_adv_no}</p>
          </div>
        )}

        {/* Commission */}
        {order.commission > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Commission</p>
            <p className="text-xs text-foreground tabular-nums">{Number(order.commission).toFixed(4)} {order.asset}</p>
          </div>
        )}

        {/* Order Actions — gated by terminal_orders_actions */}
        {canActions && (
          <OrderActions
            orderNumber={order.binance_order_number}
            orderStatus={effectiveRawStatus}
            tradeType={order.trade_type}
            additionalKycVerify={order.additional_kyc_verify}
            totalPrice={order.total_price}
            quickConfirmAmountUpLimit={liveDetail?.quickConfirmAmountUpLimit}
            asset={order.asset}
            fiatUnit={liveDetail?.fiatUnit || 'INR'}
            advNo={(liveDetail?.advNo as string | undefined) || undefined}
          />
        )}
      </div>

      {/* Update Payment Method Dialog */}
      {altUpiRequest && (
        <UpdatePaymentMethodDialog
          open={showUpdateDialog}
          onOpenChange={setShowUpdateDialog}
          requestId={altUpiRequest.id}
          orderNumber={order.binance_order_number}
        />
      )}
    </div>
  );
}

/** Countdown timer based on Binance payTimeLimit */
function CountdownTimer({ expiryTime, payTimeLimitMinutes }: { expiryTime: number; payTimeLimitMinutes?: number }) {
  const [remaining, setRemaining] = useState('');
  const [isExpired, setIsExpired] = useState(false);
  const [urgency, setUrgency] = useState<'normal' | 'warning' | 'critical'>('normal');

  useEffect(() => {
    const update = () => {
      const diff = expiryTime - Date.now();
      if (diff <= 0) {
        setRemaining('Expired');
        setIsExpired(true);
        setUrgency('critical');
        return;
      }
      const totalSecs = Math.floor(diff / 1000);
      const mins = Math.floor(totalSecs / 60);
      const secs = totalSecs % 60;
      setRemaining(`${mins}m ${secs.toString().padStart(2, '0')}s`);
      setIsExpired(false);
      
      // Set urgency levels
      if (mins < 2) setUrgency('critical');
      else if (mins < 5) setUrgency('warning');
      else setUrgency('normal');
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiryTime]);

  const colorClass = urgency === 'critical'
    ? 'text-destructive'
    : urgency === 'warning'
    ? 'text-trade-pending'
    : 'text-foreground';

  return (
    <div className="flex items-start gap-2.5">
      {urgency === 'critical' ? (
        <AlertTriangle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0 animate-pulse" />
      ) : (
        <Timer className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
      )}
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground">
          {isExpired ? 'Payment Window' : `Time Remaining${payTimeLimitMinutes ? ` (${payTimeLimitMinutes}min window)` : ''}`}
        </p>
        <p className={`text-xs font-medium tabular-nums ${colorClass}`}>{remaining}</p>
      </div>
    </div>
  );
}

/** Fallback: Live elapsed timer when payTimeLimit is not available */
function ElapsedTimer({ createTime }: { createTime: number }) {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    const update = () => {
      const diff = Math.max(0, Date.now() - createTime);
      const hours = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setElapsed(hours > 0 ? `${hours}h ${mins}m ${secs}s` : `${mins}m ${secs}s`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [createTime]);

  return (
    <div className="flex items-start gap-2.5">
      <Timer className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground">Elapsed</p>
        <p className="text-xs font-medium text-foreground tabular-nums">{elapsed}</p>
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value, mono }: { icon: any; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground">{label}</p>
        <p className={`text-xs text-foreground ${mono ? 'font-mono' : ''} break-all`}>{value}</p>
      </div>
    </div>
  );
}
