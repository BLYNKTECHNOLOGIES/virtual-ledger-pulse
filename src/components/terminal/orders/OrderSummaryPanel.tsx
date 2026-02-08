import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { User, Clock, CreditCard, Hash, Timer } from 'lucide-react';
import { P2POrderRecord } from '@/hooks/useP2PTerminal';
import { CounterpartyBadge } from './CounterpartyBadge';
import { OrderActions } from './OrderActions';
import { format } from 'date-fns';
import { mapToOperationalStatus, getStatusStyle } from '@/lib/orderStatusMapper';
import { useState, useEffect } from 'react';

interface Props {
  order: P2POrderRecord;
  counterpartyVerifiedName?: string;
}

export function OrderSummaryPanel({ order, counterpartyVerifiedName }: Props) {
  const tradeColor = order.trade_type === 'BUY' ? 'text-trade-buy' : 'text-trade-sell';
  const tradeBg = order.trade_type === 'BUY' ? 'bg-trade-buy/10' : 'bg-trade-sell/10';
  const opStatus = mapToOperationalStatus(order.order_status, order.trade_type);
  const isTerminal = ['Completed', 'Cancelled', 'Expired'].includes(opStatus);

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

        {/* Elapsed timer for active orders */}
        {order.binance_create_time && !isTerminal && (
          <ElapsedTimer createTime={new Date(order.binance_create_time).getTime()} />
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
        />
      </div>
    </div>
  );
}

/** Live elapsed timer */
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
