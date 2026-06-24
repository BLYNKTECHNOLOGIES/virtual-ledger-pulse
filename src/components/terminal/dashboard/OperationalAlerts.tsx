import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Clock, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
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

  const severityStyles: Record<Severity, string> = {
    error: 'border-l-destructive bg-destructive/5',
    warning: 'border-l-trade-pending bg-trade-pending/5',
    info: 'border-l-primary bg-primary/5',
    success: 'border-l-trade-buy bg-trade-buy/5',
  };

  const iconStyles: Record<Severity, string> = {
    error: 'text-destructive',
    warning: 'text-trade-pending',
    info: 'text-primary',
    success: 'text-trade-buy',
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-trade-pending" />
          Operational Alerts
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map(i => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : (
          <div className="space-y-2">
            {alerts.map((a, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 p-3 rounded-md border-l-2 ${severityStyles[a.severity]}`}
              >
                <a.icon className={`h-4 w-4 mt-0.5 shrink-0 ${iconStyles[a.severity]}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground">{a.label}</p>
                  {a.orderNumbers.length > 0 ? (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-muted-foreground">{a.detailLabel}</span>
                      {a.orderNumbers.map(num => (
                        <Link
                          key={num}
                          to={`/terminal/orders?order=${encodeURIComponent(num)}`}
                          className="text-[11px] font-medium text-primary hover:underline tabular-nums"
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
      </CardContent>
    </Card>
  );
}
