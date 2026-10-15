import { memo, useMemo } from 'react';
import { BarChart3 } from 'lucide-react';
import { C2COrderHistoryItem } from '@/hooks/useBinanceOrders';
import { roundShares } from './dashFormat';

interface Props {
  orders: C2COrderHistoryItem[];
  isLoading: boolean;
  /** Pre-computed status counts for the sealed (older than 45 days) part of the window. */
  precomputedCounts?: Record<string, number>;
  /** Order history could not be read for the period. */
  unavailable?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  Completed: 'hsl(var(--trade-buy))',
  Cancelled: 'hsl(var(--muted-foreground))',
  'Auto-Cancelled': 'hsl(var(--muted-foreground) / 0.6)',
  Appeal: 'hsl(var(--destructive))',
  Paid: 'hsl(var(--chart-1))',
  Trading: 'hsl(var(--trade-pending))',
  Pending: 'hsl(var(--warning))',
  Expired: 'hsl(var(--chart-4))',
};

function OrderStatusBreakdownPanel({ orders, isLoading, precomputedCounts, unavailable }: Props) {
  const data = useMemo(() => {
    const statusMap = new Map<string, number>();
    for (const [status, count] of Object.entries(precomputedCounts || {})) {
      if (count > 0) statusMap.set(status, (statusMap.get(status) || 0) + count);
    }
    for (const o of orders) {
      const status = normalizeStatus(o.orderStatus || 'UNKNOWN');
      statusMap.set(status, (statusMap.get(status) || 0) + 1);
    }
    if (statusMap.size === 0) return [];

    return Array.from(statusMap.entries())
      .map(([status, count]) => ({ status, count, color: STATUS_COLORS[status] || 'hsl(var(--chart-3))' }))
      .sort((a, b) => b.count - a.count);
  }, [orders, precomputedCounts]);


  const total = data.reduce((s, d) => s + d.count, 0);
  // Shares rounded together so the list sums to 100%; a few orders in a big period read "<1%", not "0%".
  const shares = roundShares(data.map((d) => d.count));
  const shareText = (i: number) => (shares[i] === 0 && data[i].count > 0 ? '<1%' : `${shares[i]}%`);

  return (
    <div className="t-panel flex h-full flex-col">
      <div className="t-panel-head">
        <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        <span className="t-panel-head-title">Order status</span>
        {!isLoading && total > 0 && (
          <span className="ml-auto text-[10px] text-muted-foreground t-mono">{total.toLocaleString('en-IN')} orders</span>
        )}
      </div>
      <div className="@container flex-1 p-3">
        {isLoading ? (
          <div className="space-y-2.5">
            <div className="t-shimmer h-2.5 w-full rounded-full" />
            {[1, 2, 3, 4].map(i => <div key={i} className="t-shimmer h-5 w-full rounded" />)}
          </div>
        ) : unavailable ? (
          <div className="flex h-56 flex-col items-center justify-center gap-2 text-center">
            <BarChart3 className="h-7 w-7 text-muted-foreground/40" aria-hidden="true" />
            <div className="text-xs font-medium text-foreground">Order history couldn't be loaded</div>
            <div className="text-[11px] text-muted-foreground">Use Retry at the top of the page.</div>
          </div>
        ) : data.length === 0 ? (
          <div className="flex h-56 flex-col items-center justify-center gap-2 text-center">
            <BarChart3 className="h-7 w-7 text-muted-foreground/40" aria-hidden="true" />
            <div className="text-xs font-medium text-foreground">No orders in this period</div>
            <div className="text-[11px] text-muted-foreground">The status split appears once orders exist.</div>
          </div>
        ) : (
          <div className="space-y-3">
            <div
              className="flex h-2.5 w-full gap-px overflow-hidden rounded-full bg-secondary"
              role="img"
              aria-label={data.map((d, i) => `${d.status} ${shareText(i)}`).join(', ')}
            >
              {data.map((d) => (
                <div key={d.status} className="h-full" style={{ width: `${(d.count / total) * 100}%`, backgroundColor: d.color }} />
              ))}
            </div>
            {/* Two columns on wide panels, still read top to bottom in rank order */}
            <ul className="gap-x-8 @[36rem]:columns-2">
              {data.map((d, i) => (
                <li key={d.status} className="grid break-inside-avoid grid-cols-[minmax(0,1fr)_auto_2.5rem] items-center gap-3 rounded px-1 py-1.5 text-xs">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: d.color }} aria-hidden="true" />
                    <span className="truncate text-muted-foreground">{d.status}</span>
                  </span>
                  <span className="font-medium text-foreground t-mono tabular-nums">{d.count.toLocaleString('en-IN')}</span>
                  <span className="text-right text-[11px] text-muted-foreground t-mono tabular-nums">{shareText(i)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// Memoised: the page re-renders on every live-orders poll; this panel only when its own props change.
export const OrderStatusBreakdown = memo(OrderStatusBreakdownPanel);

function normalizeStatus(raw: string): string {
  const s = raw.toUpperCase();
  if (s.includes('COMPLETED') || s.includes('RELEASED')) return 'Completed';
  if (s.includes('CANCELLED_BY_SYSTEM') || s.includes('CANCELED_BY_SYSTEM')) return 'Auto-Cancelled';
  if (s.includes('CANCEL')) return 'Cancelled';
  if (s.includes('APPEAL') || s.includes('DISPUTE') || s.includes('COMPLAINT')) return 'Appeal';
  if (s.includes('BUYER_PAYED') || s.includes('BUYER_PAID')) return 'Paid';
  if (s.includes('TRADING')) return 'Trading';
  if (s.includes('PENDING')) return 'Pending';
  if (s.includes('EXPIRED') || s.includes('TIMEOUT')) return 'Expired';
  return raw;
}
