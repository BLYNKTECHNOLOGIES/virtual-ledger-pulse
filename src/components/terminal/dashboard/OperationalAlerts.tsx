import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Clock, ShieldAlert } from 'lucide-react';
import { C2COrderHistoryItem } from '@/hooks/useBinanceOrders';

interface Props {
  orders: C2COrderHistoryItem[];
  isLoading: boolean;
}

export function OperationalAlerts({ orders, isLoading }: Props) {
  const alerts = useMemo(() => {
    if (!orders.length) return [];

    const items: { icon: typeof AlertTriangle; label: string; detail: string; severity: 'warning' | 'error' | 'info' }[] = [];

    // Check for appeals
    const appealOrders = orders.filter(o => (o.orderStatus || '').toUpperCase().includes('APPEAL'));
    if (appealOrders.length > 0) {
      items.push({
        icon: ShieldAlert,
        label: `${appealOrders.length} Active Appeal${appealOrders.length > 1 ? 's' : ''}`,
        detail: `Order${appealOrders.length > 1 ? 's' : ''}: ${appealOrders.slice(0, 2).map(o => o.orderNumber.slice(-6)).join(', ')}`,
        severity: 'error',
      });
    }

    // Check for pending orders (might be stale)
    const pendingOrders = orders.filter(o => {
      const status = (o.orderStatus || '').toUpperCase();
      return status.includes('TRADING') || status.includes('PENDING') || status.includes('BUYER_PAYED');
    });
    if (pendingOrders.length > 3) {
      items.push({
        icon: Clock,
        label: `${pendingOrders.length} Orders Awaiting Action`,
        detail: 'Multiple orders need operator attention',
        severity: 'warning',
      });
    }

    if (items.length === 0) {
      items.push({
        icon: AlertTriangle,
        label: 'No Active Alerts',
        detail: 'All operations running normally',
        severity: 'info',
      });
    }

    return items;
  }, [orders]);

  const severityClasses = {
    error: 'border-l-destructive bg-destructive/5',
    warning: 'border-l-trade-pending bg-trade-pending/5',
    info: 'border-l-primary bg-primary/5',
  };

  const iconClasses = {
    error: 'text-destructive',
    warning: 'text-trade-pending',
    info: 'text-primary',
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
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <div
              key={i}
              className={`flex items-start gap-3 p-3 rounded-md border-l-2 ${severityClasses[a.severity]}`}
            >
              <a.icon className={`h-4 w-4 mt-0.5 shrink-0 ${iconClasses[a.severity]}`} />
              <div>
                <p className="text-xs font-medium text-foreground">{a.label}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{a.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
