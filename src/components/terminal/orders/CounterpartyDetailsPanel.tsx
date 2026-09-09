import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { User, ShieldCheck, Clock, CreditCard, TrendingUp, AlertTriangle, RefreshCw } from 'lucide-react';
import { useCounterpartyPanel } from '@/hooks/useCounterpartyProfile';
import { useCounterpartyLinkedClient } from '@/hooks/useCounterpartyLinkedClient';
import { mapToOperationalStatus, getStatusStyle } from '@/lib/orderStatusMapper';
import { useNavigate } from 'react-router-dom';

interface Props {
  orderNumber: string;
  counterpartyNickname: string;
  counterpartyVerifiedName?: string | null;
  tradeType: string;
  exchangeAccountId?: string | null;
}

const NA = <span className="text-muted-foreground">Not available</span>;

function istDate(ms?: number | null) {
  if (!ms) return null;
  return new Date(Number(ms)).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short', year: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function mins(v?: number | null) {
  if (v === null || v === undefined) return null;
  if (v < 1) return `${Math.round(v * 60)}s`;
  if (v < 60) return `${v.toFixed(1)} min`;
  return `${(v / 60).toFixed(1)} hr`;
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-secondary/40 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-[12px] t-mono text-foreground tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

export function CounterpartyDetailsPanel({
  orderNumber, counterpartyNickname, counterpartyVerifiedName, tradeType, exchangeAccountId,
}: Props) {
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);
  const isSynthetic = orderNumber.startsWith('INQ-');

  const { data, isLoading, isError, isFetching, refetch } = useCounterpartyPanel(orderNumber, exchangeAccountId);
  const profile = data?.profile ?? null;
  const pastOrders = data?.pastOrders ?? [];
  const { data: linkedClient } = useCounterpartyLinkedClient(
    counterpartyNickname,
    counterpartyVerifiedName || profile?.verified_name,
    (tradeType?.toUpperCase() === 'BUY' ? 'BUY' : 'SELL')
  );

  const cancelRate = useMemo(() => {
    if (!profile || profile.total_orders === 0) return null;
    return (profile.cancelled_orders / profile.total_orders) * 100;
  }, [profile]);

  const visibleOrders = showAll ? pastOrders : pastOrders.slice(0, 8);

  if (isSynthetic) {
    return (
      <div className="p-3 text-[11px] text-muted-foreground">
        This enquiry has no linked Binance order yet, so no trade record is available for this
        counterparty.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3 space-y-3">
      {/* Identity */}
      <div className="flex items-start gap-2">
        <div className="h-9 w-9 rounded-md bg-secondary border border-border flex items-center justify-center shrink-0">
          <User className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-foreground truncate">{counterpartyNickname}</div>
          <div className="text-[10px] text-muted-foreground truncate">
            {counterpartyVerifiedName || profile?.verified_name || 'Verified name not available'}
          </div>
        </div>
      </div>

      {/* Client link */}
      {linkedClient ? (
        <button
          type="button"
          onClick={() => navigate(`/clients/${linkedClient.client_id}`)}
          className="w-full text-left rounded-md border border-border bg-secondary/40 px-2 py-1.5 hover:bg-secondary transition-colors"
        >
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="h-3 w-3 text-trade-buy" />
            <span className="text-[11px] text-foreground truncate">{linkedClient.name}</span>
          </div>
          <div className="text-[9px] text-muted-foreground mt-0.5">
            Approved client · matched by {linkedClient.matchedBy === 'nickname' ? 'nickname' : 'verified name'}
            {linkedClient.risk_appetite ? ` · ${linkedClient.risk_appetite}` : ''}
          </div>
        </button>
      ) : (
        <div className="rounded-md border border-dashed border-border px-2 py-1.5 text-[10px] text-muted-foreground">
          No approved client linked to this counterparty.
        </div>
      )}

      {/* Trade record */}
      <div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1">
          <TrendingUp className="h-3 w-3" /> Trade record
        </div>
        {isLoading ? (
          <div className="grid grid-cols-2 gap-1.5">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
          </div>
        ) : isError ? (
          <div className="rounded-md border border-warning/30 bg-warning/5 p-2">
            <div className="text-[11px] text-foreground">Trade record is temporarily unavailable.</div>
            <div className="mt-1 text-[9px] text-muted-foreground">The stored orders were not reported as empty.</div>
            <Button variant="ghost" size="sm" className="mt-1 h-7 px-1.5 text-[10px]" disabled={isFetching} onClick={() => refetch()}>
              <RefreshCw className={`mr-1 h-3 w-3 ${isFetching ? 'animate-spin' : ''}`} /> Retry
            </Button>
          </div>
        ) : profile && profile.total_orders > 0 ? (
          <div className="grid grid-cols-2 gap-1.5">
            <Stat label="Orders" value={profile.total_orders} />
            <Stat label="Completed" value={profile.completed_orders} />
            <Stat label="Cancelled" value={`${profile.cancelled_orders}${cancelRate !== null ? ` (${cancelRate.toFixed(0)}%)` : ''}`} />
            <Stat label="Buy / Sell" value={`${profile.buy_orders} / ${profile.sell_orders}`} />
            <Stat label="Total value" value={`₹${profile.total_value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} />
            <Stat label="Typical order" value={profile.median_value ? `₹${profile.median_value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : NA} />
            <Stat label="First trade" value={istDate(profile.first_trade_time) || NA} />
            <Stat label="Last trade" value={istDate(profile.last_trade_time) || NA} />
          </div>
        ) : (
          <div className="text-[11px] text-muted-foreground">No stored order history for this counterparty.</div>
        )}
      </div>

      {/* Behaviour */}
      {profile && profile.total_orders > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1">
            <Clock className="h-3 w-3" /> Behaviour signals
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Avg time to mark paid</span>
              <span className="t-mono text-foreground">
                {profile.avg_pay_minutes !== null ? `${mins(profile.avg_pay_minutes)} (${profile.pay_sample})` : NA}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Avg pay → release gap</span>
              <span className="t-mono text-foreground">
                {profile.avg_release_minutes !== null ? `${mins(profile.avg_release_minutes)} (${profile.release_sample})` : NA}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground flex items-center gap-1"><CreditCard className="h-3 w-3" /> Most used method</span>
              <span className="t-mono text-foreground truncate max-w-[55%] text-right">{profile.top_pay_method || NA}</span>
            </div>
            {profile.complaint_orders > 0 && (
              <div className="flex items-center gap-1 text-[11px] text-destructive">
                <AlertTriangle className="h-3 w-3" />
                {profile.complaint_orders} order(s) with a complaint on record
              </div>
            )}
          </div>
        </div>
      )}

      {/* Past orders */}
      <div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
          Past orders {pastOrders.length > 0 && `(${pastOrders.length})`}
        </div>
        {isLoading ? (
          <div className="space-y-1">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
        ) : isError ? (
          <div className="text-[11px] text-muted-foreground">Past orders could not be loaded. Use Retry above.</div>
        ) : pastOrders.length === 0 ? (
          <div className="text-[11px] text-muted-foreground">No earlier orders with this counterparty.</div>
        ) : (
          <div className="space-y-1">
            {visibleOrders.map((o) => {
              const style = getStatusStyle(mapToOperationalStatus(o.order_status || '', o.trade_type));
              return (
                <div key={o.order_number} className="rounded-md border border-border bg-secondary/30 px-2 py-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[10px] t-mono font-bold ${o.trade_type === 'BUY' ? 'text-trade-buy' : 'text-trade-sell'}`}>
                      {o.trade_type}
                    </span>
                    <span className="text-[10px] t-mono text-foreground tabular-nums">
                      ₹{Number(o.total_price || 0).toLocaleString('en-IN')}
                    </span>
                    <Badge variant="outline" className={`text-[8px] ${style.badgeClass}`}>{style.label}</Badge>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-[9px] t-mono text-muted-foreground">#{o.order_number.slice(-8)}</span>
                    <span className="text-[9px] text-muted-foreground">{istDate(o.create_time)}</span>
                  </div>
                </div>
              );
            })}
            {pastOrders.length > visibleOrders.length && (
              <Button variant="ghost" size="sm" className="w-full h-7 text-[10px]" onClick={() => setShowAll(true)}>
                Show all {pastOrders.length}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
