import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Clock, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { C2COrderHistoryItem } from '@/hooks/useBinanceOrders';

interface Props {
  orders: C2COrderHistoryItem[];
  isLoading: boolean;
}

type Severity = 'warning' | 'error' | 'info' | 'success';

interface AlertItem {
  icon: typeof AlertTriangle;
  label: string;
  detailLabel: string;
  orderNumbers: string[];
  severity: Severity;
}

export function OperationalAlerts({ orders, isLoading }: Props) {
  const alerts = useMemo<AlertItem[]>(() => {
    if (!orders.length) return [];

    const items: AlertItem[] = [];
    const STALE_MS = 24 * 60 * 60 * 1000;
    const now = Date.now();

    const appealOrders = orders.filter(o => {
      const s = (o.orderStatus || '').toUpperCase();
      return s.includes('APPEAL') || s.includes('DISPUTE') || s.includes('COMPLAINT') || (o as any).hasActiveComplaint;
    });
    if (appealOrders.length > 0) {
      items.push({
        icon: ShieldAlert,
        label: `${appealOrders.length} Active Appeal${appealOrders.length > 1 ? 's' : ''}`,
        detailLabel: `Order${appealOrders.length > 1 ? 's' : ''}:`,
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
        label: `${releaseOrders.length} Awaiting Release`,
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
        label: `${pendingOrders.length} Order${pendingOrders.length > 1 ? 's' : ''} Awaiting Payment`,
        detailLabel: `Order${pendingOrders.length > 1 ? 's' : ''}:`,
        orderNumbers: pendingOrders.map(o => o.orderNumber).filter(Boolean),
        severity: pendingOrders.length > 3 ? 'warning' : 'info',
      });
    }

    if (items.length === 0) {
      items.push({
        icon: CheckCircle2,
        label: 'All Clear',
        detailLabel: 'No active alerts — operations running normally',
        orderNumbers: [],
        severity: 'success',
      });
    }

    return items;
  }, [orders]);

  const dotStyles: Record<Severity, string> = {
    error: 'bg-destructive',
    warning: 'bg-trade-pending',
    info: 'bg-primary',
    success: 'bg-trade-buy',
  };

  const badgeStyles: Record<Severity, string> = {
    error: 'bg-destructive/10 text-destructive',
    warning: 'bg-trade-pending/10 text-trade-pending',
    info: 'bg-primary/10 text-primary',
    success: 'bg-trade-buy/10 text-trade-buy',
  };

  const iconStyles: Record<Severity, string> = {
    error: 'text-destructive',
    warning: 'text-trade-pending',
    info: 'text-primary',
    success: 'text-trade-buy',
  };

  const isEmptyState = alerts.length === 1 && alerts[0].severity === 'success';

  return (
    <div className="t-panel flex flex-col">
      <div className="t-panel-head">
        <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="t-panel-head-title">Operational Alerts</span>
      </div>
      <div>
        {isLoading ? (
          <div className="space-y-2 p-3">
            {[1, 2].map(i => <div key={i} className="t-shimmer h-12 w-full rounded-md" />)}
          </div>
        ) : isEmptyState ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10">
            <CheckCircle2 className="h-8 w-8 text-trade-buy/50" />
            <p className="text-xs text-muted-foreground">All clear — operations running normally</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {alerts.map((a, i) => (
              <div key={i} className="flex items-start gap-3 py-2 px-3">
                <span className={`mt-1 h-2 w-2 rounded-full shrink-0 ${dotStyles[a.severity]}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <a.icon className={`h-3.5 w-3.5 shrink-0 ${iconStyles[a.severity]}`} />
                    <span className={`text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded ${badgeStyles[a.severity]}`}>{a.severity}</span>
                    <p className="text-xs font-medium text-foreground truncate">{a.label}</p>
                  </div>
                  {a.orderNumbers.length > 0 ? (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-muted-foreground">{a.detailLabel}</span>
                      {a.orderNumbers.map(num => (
                        <Link
                          key={num}
                          to={`/terminal/orders?order=${encodeURIComponent(num)}`}
                          className="text-[11px] font-medium text-primary hover:underline t-mono"
                          title={`Open order ${num}`}
                        >
                          {num}
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground mt-0.5">{a.detailLabel}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
