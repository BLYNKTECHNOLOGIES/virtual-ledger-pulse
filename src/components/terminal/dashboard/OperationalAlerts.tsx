import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Clock, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { C2COrderHistoryItem } from '@/hooks/useBinanceOrders';

interface Props {
  orders: C2COrderHistoryItem[];
  isLoading: boolean;
}

export function OperationalAlerts({ orders, isLoading }: Props) {
  const alerts = useMemo(() => {
    if (!orders.length) return [];

    const items: { icon: typeof AlertTriangle; label: string; detail: string; severity: 'warning' | 'error' | 'info' | 'success' }[] = [];

    const appealOrders = orders.filter(o => (o.orderStatus || '').toUpperCase().includes('APPEAL'));
    if (appealOrders.length > 0) {
      items.push({
        icon: ShieldAlert,
        label: `${appealOrders.length} Active Appeal${appealOrders.length > 1 ? 's' : ''}`,
        detail: `Order${appealOrders.length > 1 ? 's' : ''}: ${appealOrders.slice(0, 2).map(o => o.orderNumber.slice(-6)).join(', ')}`,
        severity: 'error',
      });
    }

    const pendingOrders = orders.filter(o => {
      const status = (o.orderStatus || '').toUpperCase();
      return status.includes('TRADING') || status.includes('PENDING') || status.includes('BUYER_PAYED');
    });
    if (pendingOrders.length > 0) {
      items.push({
        icon: Clock,
        label: `${pendingOrders.length} Order${pendingOrders.length > 1 ? 's' : ''} Awaiting Action`,
        detail: pendingOrders.length > 3 ? 'Multiple orders need operator attention' : `Order${pendingOrders.length > 1 ? 's' : ''}: ${pendingOrders.slice(0, 3).map(o => o.orderNumber.slice(-6)).join(', ')}`,
        severity: pendingOrders.length > 3 ? 'warning' : 'info',
      });
    }

    if (items.length === 0) {
      items.push({
        icon: CheckCircle2,
        label: 'All Clear',
        detail: 'No active alerts — operations running normally',
        severity: 'success',
      });
    }

    return items;
  }, [orders]);

  const severityStyles = {
    error: 'border-l-destructive bg-destructive/5',
    warning: 'border-l-trade-pending bg-trade-pending/5',
    info: 'border-l-primary bg-primary/5',
    success: 'border-l-trade-buy bg-trade-buy/5',
  };

  const iconStyles = {
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
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground">{a.label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{a.detail}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
