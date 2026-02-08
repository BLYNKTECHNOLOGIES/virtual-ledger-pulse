import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Megaphone, ShoppingCart, ArrowUpRight, RefreshCw } from 'lucide-react';
import { TimePeriodFilter, TimePeriod, getTimestampsForPeriod } from '@/components/terminal/dashboard/TimePeriodFilter';
import { MetricCards } from '@/components/terminal/dashboard/MetricCards';
import { TradeVolumeChart } from '@/components/terminal/dashboard/TradeVolumeChart';
import { AdPerformanceWidget } from '@/components/terminal/dashboard/AdPerformanceWidget';
import { OperationalAlerts } from '@/components/terminal/dashboard/OperationalAlerts';
import { OrderStatusBreakdown } from '@/components/terminal/dashboard/OrderStatusBreakdown';
import { useBinanceOrderHistory, computeOrderStats, C2COrderHistoryItem } from '@/hooks/useBinanceOrders';

export default function TerminalDashboard() {
  const [period, setPeriod] = useState<TimePeriod>('30d');

  const timestamps = getTimestampsForPeriod(period);
  const { data: orderData, isLoading: ordersLoading, refetch, isFetching } = useBinanceOrderHistory({
    startTimestamp: timestamps.startTimestamp,
    endTimestamp: timestamps.endTimestamp,
    rows: 100,
  });

  const orders: C2COrderHistoryItem[] = useMemo(() => {
    return orderData?.data || [];
  }, [orderData]);

  const stats = useMemo(() => computeOrderStats(orders), [orders]);

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header with period filter */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Dashboard</h1>
          <p className="text-xs text-muted-foreground mt-0.5">P2P Trading Operations Overview</p>
        </div>
        <div className="flex items-center gap-2">
          <TimePeriodFilter value={period} onChange={setPeriod} />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Metric cards */}
      <MetricCards
        activeOrders={stats.activeOrders}
        pendingPayments={stats.pendingPayments}
        completedToday={stats.completedToday}
        appeals={stats.appeals}
        isLoading={ordersLoading}
      />

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TradeVolumeChart orders={orders} isLoading={ordersLoading} period={period} />
        <OrderStatusBreakdown orders={orders} isLoading={ordersLoading} />
      </div>

      {/* Widgets row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AdPerformanceWidget />
        <OperationalAlerts orders={orders} isLoading={ordersLoading} />
      </div>

      {/* Quick access */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Link to="/terminal/ads">
          <Card className="bg-card border-border hover:border-primary/30 transition-colors cursor-pointer group">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Megaphone className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">Ads Manager</h3>
                <p className="text-[11px] text-muted-foreground">Create, edit & manage P2P ads</p>
              </div>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </CardContent>
          </Card>
        </Link>

        <Card className="bg-card border-border opacity-50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-foreground">Orders</h3>
              <p className="text-[11px] text-muted-foreground">Coming in Phase 3</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
