import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { User, Clock, CreditCard, Hash, Timer, AlertTriangle } from 'lucide-react';
import { P2POrderRecord } from '@/hooks/useP2PTerminal';
import { CounterpartyBadge } from './CounterpartyBadge';
import { OrderActions } from './OrderActions';
import { format } from 'date-fns';
import { mapToOperationalStatus, getStatusStyle } from '@/lib/orderStatusMapper';
import { useState, useEffect } from 'react';

interface Props {
  order: P2POrderRecord;
  counterpartyVerifiedName?: string;
  liveDetail?: any;
}

export function OrderSummaryPanel({ order, counterpartyVerifiedName, liveDetail }: Props) {
  const tradeColor = order.trade_type === 'BUY' ? 'text-trade-buy' : 'text-trade-sell';
  const tradeBg = order.trade_type === 'BUY' ? 'bg-trade-buy/10' : 'bg-trade-sell/10';
  const opStatus = mapToOperationalStatus(order.order_status, order.trade_type);
  const isTerminal = ['Completed', 'Cancelled', 'Expired'].includes(opStatus);

  // Use Binance's exact expectedPayTime for countdown, or fall back to payTimeLimit calculation
  const expectedPayTimeMs = liveDetail?.expectedPayTime;
  const payTimeLimit = liveDetail?.confirmPayedExpireMinute || liveDetail?.payTimeLimit || liveDetail?.paymentTimeLimit;
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

        {/* Countdown timer for active orders — uses expectedPayTime or payTimeLimit from Binance */}
        {!isTerminal && expectedPayTimeMs && (
          <CountdownTimer expiryTime={expectedPayTimeMs} payTimeLimitMinutes={payTimeLimit} />
        )}

        {/* Fallback: countdown from payTimeLimit if no expectedPayTime */}
        {!isTerminal && !expectedPayTimeMs && createTimeMs && payTimeLimit && (
          <CountdownTimer expiryTime={createTimeMs + payTimeLimit * 60 * 1000} payTimeLimitMinutes={payTimeLimit} />
        )}

        {/* Fallback: elapsed timer if nothing available */}
        {createTimeMs && !isTerminal && !expectedPayTimeMs && !payTimeLimit && (
          <ElapsedTimer createTime={createTimeMs} />
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

        {/* Order Actions */}
        <OrderActions
          orderNumber={order.binance_order_number}
          orderStatus={order.order_status}
          tradeType={order.trade_type}
          additionalKycVerify={order.additional_kyc_verify}
        />
      </div>
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
