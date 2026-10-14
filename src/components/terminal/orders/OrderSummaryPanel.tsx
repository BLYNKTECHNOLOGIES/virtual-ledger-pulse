import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { User, Clock, CreditCard, Hash, Timer, AlertTriangle, RefreshCw, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { P2POrderRecord } from '@/hooks/useP2PTerminal';
import { CounterpartyBadge } from './CounterpartyBadge';
import { PaymentDetailsCard } from './PaymentDetailsCard';
import { OrderActions } from './OrderActions';
import { UpdatePaymentMethodDialog } from './UpdatePaymentMethodDialog';
import { format } from 'date-fns';
import { mapToOperationalStatus, getStatusStyle, normaliseBinanceStatus, hasActiveBinanceComplaint } from '@/lib/orderStatusMapper';
import { useState, useEffect } from 'react';
import { useAlternateUpiRequest } from '@/hooks/usePayerModule';
import { useTerminalAuth } from '@/hooks/useTerminalAuth';
import { useCounterpartyCompletedOrderCount } from '@/hooks/useBinanceActions';

interface Props {
  order: P2POrderRecord;
  counterpartyVerifiedName?: string;
  liveDetail?: any;
  preserveOrderStatus?: boolean;
}

export function OrderSummaryPanel({ order, counterpartyVerifiedName, liveDetail, preserveOrderStatus = false }: Props) {
  const { hasPermission, isTerminalAdmin } = useTerminalAuth();
  const {
    data: completedHistory,
    isPending: isHistoryLoading,
    isError: isHistoryUnavailable,
  } = useCounterpartyCompletedOrderCount(order.binance_order_number, order.exchange_account_id);
  const canActions = hasPermission('terminal_orders_actions') || isTerminalAdmin;
  const tradeColor = order.trade_type === 'BUY' ? 'text-trade-buy' : 'text-trade-sell';
  const tradeChip = order.trade_type === 'BUY'
    ? 'bg-[hsl(var(--trade-buy,var(--success))/0.1)] text-trade-buy border border-[hsl(var(--trade-buy,var(--success))/0.25)]'
    : 'bg-[hsl(var(--trade-sell,var(--destructive))/0.1)] text-trade-sell border border-[hsl(var(--trade-sell,var(--destructive))/0.25)]';


  // Finalized states from live detail outrank stale cached active states,
  // except when the caller is opening an active Appeal case and needs that status preserved.
  const liveStatusRaw = liveDetail?.orderStatus;
  const liveStatusCanonical = (() => {
    if (liveStatusRaw === undefined || liveStatusRaw === null) return null;
    return normaliseBinanceStatus(liveStatusRaw);
  })();
  const liveIsFinalized = !preserveOrderStatus && liveStatusCanonical
    ? ['COMPLETED', 'CANCELLED', 'EXPIRED'].some(t => liveStatusCanonical.includes(t))
    : false;
  const effectiveRawStatus = order.appeal_order_status || (liveIsFinalized ? (liveStatusCanonical as string) : order.order_status);

  const opStatus = mapToOperationalStatus(effectiveRawStatus, order.trade_type);
  const appealOpStatus = order.appeal_status || hasActiveBinanceComplaint(liveDetail) ? mapToOperationalStatus(order.appeal_status || 'APPEAL', order.trade_type) : null;
  const shouldShowAppealStatus = appealOpStatus === 'Under Appeal' && opStatus !== 'Under Appeal';
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

  const statusStyle = getStatusStyle(opStatus);

  return (
    <div className="flex flex-col h-full">
      {/* Amount + timer */}
      <div className="px-4 py-3 border-b border-border space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <Badge className={`${tradeChip} text-[10px] font-bold uppercase tracking-wide t-mono rounded`}>
            {order.trade_type}
          </Badge>
          <CounterpartyBadge
            repeatCount={completedHistory?.count}
            tradeType={order.trade_type}
            isLoading={isHistoryLoading || completedHistory?.resolved === false}
            isUnavailable={isHistoryUnavailable}
          />
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {order.trade_type === 'BUY' ? 'You pay' : 'You receive'}
          </p>
          <h2 className={`text-xl font-semibold t-mono tabular-nums leading-tight ${tradeColor}`}>
            ₹{Number(order.total_price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5 t-mono tabular-nums">
            {Number(order.amount).toFixed(4)} {order.asset} @ ₹{Number(order.unit_price).toLocaleString('en-IN')}
          </p>
        </div>

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
      </div>

      <div className="flex-1 overflow-auto px-4 py-3 space-y-4">
        {/* Status */}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">Status</p>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className={`h-6 gap-1.5 rounded-full px-2.5 text-xs ${statusStyle.badgeClass}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${statusStyle.dotColor}`} />
              {statusStyle.label}
            </Badge>
            {shouldShowAppealStatus && (() => {
              const appealStyle = getStatusStyle('Under Appeal');
              return (
                <Badge variant="outline" className={`h-6 gap-1.5 rounded-full px-2.5 text-xs ${appealStyle.badgeClass}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${appealStyle.dotColor}`} />
                  {appealStyle.label}
                </Badge>
              );
            })()}
          </div>
        </div>

        {/* Alternate UPI Request Alert */}
        {hasPendingAltUpi && (
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-3.5 w-3.5 text-warning" />
              <span className="text-xs font-medium text-warning">Alternate UPI Requested</span>
            </div>
            <p className="text-[11px] text-muted-foreground">Payer has requested an alternate UPI for this order.</p>
            <Button
              size="sm"
              className="h-8 text-xs w-full"
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

        {/* Order details */}
        <dl className="divide-y divide-border/60 rounded-md border border-border">
          <InfoRow icon={Hash} label="Order ID" value={order.binance_order_number} mono copyable stacked />
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
          {/* Ad reference */}
          {order.binance_adv_no && (
            <InfoRow icon={Hash} label="Ad Reference" value={order.binance_adv_no} mono stacked />
          )}
          {/* Commission */}
          {order.commission > 0 && (
            <InfoRow icon={Hash} label="Commission" value={`${Number(order.commission).toFixed(4)} ${order.asset}`} mono />
          )}
        </dl>
      </div>

      {/* Order Actions — gated by terminal_orders_actions; pinned so they never scroll away */}
      {canActions && (
        <div className="shrink-0 border-t border-border bg-card px-4 py-3 empty:hidden">
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
            counterpartyName={counterpartyVerifiedName}
          />
        </div>
      )}

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
    <div
      className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 ${
        urgency === 'critical'
          ? 'bg-destructive/10 border-destructive/25'
          : 'bg-[hsl(var(--trade-pending,var(--warning))/0.1)] border-[hsl(var(--trade-pending,var(--warning))/0.2)]'
      }`}
      role="timer"
    >
      <div className="flex items-center gap-1.5 min-w-0">
        {urgency === 'critical' ? (
          <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
        ) : (
          <Timer className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
        <p className="text-[10px] uppercase leading-tight tracking-wide text-muted-foreground">
          {isExpired ? 'Payment Window' : `Time Remaining${payTimeLimitMinutes ? ` · ${payTimeLimitMinutes}min` : ''}`}
        </p>
      </div>
      <p className={`shrink-0 t-mono text-base font-semibold tabular-nums ${urgency === 'normal' ? 'text-trade-pending' : colorClass}`}>{remaining}</p>
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
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-secondary/40 px-3 py-2">
      <div className="flex items-center gap-1.5">
        <Timer className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Elapsed</p>
      </div>
      <p className="t-mono text-sm font-medium text-foreground tabular-nums">{elapsed}</p>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value, mono, copyable, stacked }: { icon: any; label: string; value: string; mono?: boolean; copyable?: boolean; stacked?: boolean }) {
  const copyButton = copyable ? (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(value);
        toast.success(`${label} copied`);
      }}
      className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
      aria-label={`Copy ${label}`}
      title={`Copy ${label}`}
    >
      <Copy className="h-3 w-3" />
    </button>
  ) : null;
  if (stacked) {
    return (
      <div className="px-3 py-2">
        <dt className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Icon className="h-3 w-3 shrink-0" />
          {label}
        </dt>
        <dd className="mt-0.5 flex items-start justify-between gap-1">
          <span className={`min-w-0 break-all text-xs text-foreground ${mono ? 't-mono' : ''}`}>{value}</span>
          {copyButton}
        </dd>
      </div>
    );
  }
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2">
      <dt className="flex items-center gap-1.5 shrink-0 pt-px text-[11px] text-muted-foreground">
        <Icon className="h-3 w-3 shrink-0" />
        {label}
      </dt>
      <dd className="flex min-w-0 items-start gap-1 text-right">
        <span className={`min-w-0 break-all text-xs text-foreground ${mono ? 't-mono' : ''}`}>{value}</span>
        {copyButton}
      </dd>
    </div>
  );
}
