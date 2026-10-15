import { memo, useMemo } from 'react';
import { isActiveAppealOrder } from '@/lib/orderStatusMapper';
import { Link } from 'react-router-dom';
import { AlertTriangle, Clock, ShieldAlert, CheckCircle2, ArrowUpRight, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import { C2COrderHistoryItem } from '@/hooks/useBinanceOrders';

interface Props {
  orders: C2COrderHistoryItem[];
  isLoading: boolean;
  /** Order history could not be read for the period. */
  unavailable?: boolean;
  /** The rows on screen still belong to the previous period while the new one loads. */
  pending?: boolean;
  /** The period only has orders older than the synced history the alerts read (45 days). */
  olderOnly?: boolean;
}

type Severity = 'warning' | 'error' | 'info' | 'success';

interface AlertItem {
  icon: typeof AlertTriangle;
  label: string;
  detailLabel: string;
  orderNumbers: string[];
  severity: Severity;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function OperationalAlertsPanel({ orders, isLoading, unavailable, pending = false, olderOnly = false }: Props) {
  const alerts = useMemo<AlertItem[]>(() => {
    if (!orders.length) return [];

    const items: AlertItem[] = [];
    const STALE_MS = 24 * 60 * 60 * 1000;
    const now = Date.now();

    const appealOrders = orders.filter(isActiveAppealOrder);
    if (appealOrders.length > 0) {
      items.push({
        icon: ShieldAlert,
        label: `${appealOrders.length} active ${plural(appealOrders.length, 'appeal', 'appeals')}`,
        detailLabel: `${plural(appealOrders.length, 'Order', 'Orders')}:`,
        orderNumbers: appealOrders.map(o => o.orderNumber).filter(Boolean),
        severity: 'error',
      });
    }

    const releaseOrders = orders.filter(o => {
      const s = (o.orderStatus || '').toUpperCase();
      return (s.includes('BUYER_PAYED') || s.includes('BUYER_PAID')) && (now - (o.createTime || 0)) <= STALE_MS;
    });
    if (releaseOrders.length > 0) {
      items.push({
        icon: ShieldAlert,
        label: `${releaseOrders.length} ${plural(releaseOrders.length, 'order', 'orders')} awaiting release`,
        detailLabel: 'Coin release pending:',
        orderNumbers: releaseOrders.map(o => o.orderNumber).filter(Boolean),
        severity: 'warning',
      });
    }

    const pendingOrders = orders.filter(o => {
      const status = (o.orderStatus || '').toUpperCase();
      const fresh = (now - (o.createTime || 0)) <= STALE_MS;
      return fresh && (status.includes('TRADING') || status === 'PENDING');
    });
    if (pendingOrders.length > 0) {
      items.push({
        icon: Clock,
        label: `${pendingOrders.length} ${plural(pendingOrders.length, 'order', 'orders')} awaiting payment`,
        detailLabel: `${plural(pendingOrders.length, 'Order', 'Orders')}:`,
        orderNumbers: pendingOrders.map(o => o.orderNumber).filter(Boolean),
        severity: pendingOrders.length > 3 ? 'warning' : 'info',
      });
    }

    if (items.length === 0) {
      items.push({
        icon: CheckCircle2,
        label: 'All clear',
        detailLabel: 'No active alerts — operations running normally',
        orderNumbers: [],
        severity: 'success',
      });
    }

    return items;
  }, [orders]);

  const tileStyles: Record<Severity, string> = {
    error: 'bg-destructive/10 text-destructive',
    warning: 'bg-trade-pending/10 text-trade-pending',
    info: 'bg-primary/10 text-primary',
    success: 'bg-trade-buy/10 text-trade-buy',
  };

  const tagStyles: Record<Severity, string> = {
    error: 'border-destructive/25 text-destructive',
    warning: 'border-trade-pending/30 text-trade-pending',
    info: 'border-primary/25 text-primary',
    success: 'border-trade-buy/25 text-trade-buy',
  };

  const tagText: Record<Severity, string> = {
    error: 'Urgent',
    warning: 'Attention',
    info: 'Info',
    success: 'OK',
  };

  const actionable = alerts.filter((a) => a.severity !== 'success');
  // "All clear" only for a settled, successful read of this period's own rows.
  const showLoading = isLoading || (pending && actionable.length === 0);

  const calm = (icon: typeof AlertTriangle, iconClass: string, title: string, detail: string) => {
    const Icon = icon;
    return (
      <div className="flex flex-col items-center justify-center gap-1.5 px-4 py-10 text-center">
        <Icon className={cn('h-7 w-7', iconClass)} aria-hidden="true" />
        <div className="text-xs font-medium text-foreground">{title}</div>
        <div className="text-[11px] text-muted-foreground">{detail}</div>
      </div>
    );
  };

  return (
    <div className="t-panel flex h-full flex-col">
      <div className="t-panel-head">
        <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        <span className="t-panel-head-title">Operational alerts</span>
        <Link
          to="/terminal/orders"
          className="ml-auto inline-flex items-center gap-1 rounded py-1 text-[11px] font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Orders
          <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>
      <div className="flex-1">
        {showLoading ? (
          <div className="space-y-2 p-3">
            {[1, 2].map(i => <div key={i} className="t-shimmer h-12 w-full rounded-md" />)}
          </div>
        ) : unavailable ? (
          calm(AlertTriangle, 'text-muted-foreground/40', 'Alerts unavailable', "Order history for this period couldn't be loaded.")
        ) : actionable.length > 0 ? (
          <ul className="divide-y divide-border">
            {actionable.map((a, i) => (
              <li key={i} className="flex items-start gap-3 px-3 py-2.5">
                <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md', tileStyles[a.severity])} aria-hidden="true">
                  <a.icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <div className="text-xs font-semibold text-foreground">{a.label}</div>
                    <span className={cn('inline-flex h-4 items-center rounded border px-1.5 text-[10px] font-medium', tagStyles[a.severity])}>
                      {tagText[a.severity]}
                    </span>
                  </div>
                  {a.orderNumbers.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-muted-foreground">{a.detailLabel}</span>
                      {a.orderNumbers.map(num => (
                        <Link
                          key={num}
                          to={`/terminal/orders?order=${encodeURIComponent(num)}`}
                          className="rounded border border-border bg-secondary/50 px-1.5 py-0.5 text-[11px] font-medium text-primary t-mono hover:border-primary/40 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          title={`Open order ${num}`}
                        >
                          {num}
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-0.5 text-[11px] text-muted-foreground">{a.detailLabel}</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : olderOnly ? (
          calm(History, 'text-muted-foreground/40', 'No recent orders to check', 'Alerts cover orders from the last 45 days.')
        ) : orders.length === 0 ? (
          calm(CheckCircle2, 'text-trade-buy/60', 'All clear', 'No orders in this period.')
        ) : (
          calm(CheckCircle2, 'text-trade-buy/60', 'All clear', 'No appeals, and nothing awaiting payment or release in the last 24 hours.')
        )}
      </div>
      <div className="border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
        From synced order history. Payment and release checks cover the last 24 hours; live counts are at the top.
      </div>
    </div>
  );
}

// Memoised: the page re-renders on every live-orders poll; this panel only when its own props change.
export const OperationalAlerts = memo(OperationalAlertsPanel);
