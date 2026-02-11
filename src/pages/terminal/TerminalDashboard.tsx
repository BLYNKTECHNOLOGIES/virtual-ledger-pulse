import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Megaphone, ShoppingCart, ArrowUpRight, RefreshCw, Database, CloudDownload } from 'lucide-react';
import { MetricCards } from '@/components/terminal/dashboard/MetricCards';
import { TradeVolumeChart } from '@/components/terminal/dashboard/TradeVolumeChart';
import { AdPerformanceWidget } from '@/components/terminal/dashboard/AdPerformanceWidget';
import { OperationalAlerts } from '@/components/terminal/dashboard/OperationalAlerts';
import { OrderStatusBreakdown } from '@/components/terminal/dashboard/OrderStatusBreakdown';
import { TimePeriodFilter, TimePeriod, getTimestampsForPeriod } from '@/components/terminal/dashboard/TimePeriodFilter';
import { computeOrderStats, C2COrderHistoryItem } from '@/hooks/useBinanceOrders';
import { useCachedOrderHistory, useAutoSyncOrders, useSyncOrderHistory, useSyncMetadata } from '@/hooks/useBinanceOrderSync';

export default function TerminalDashboard() {
  const { data: cachedOrders = [], isLoading: dbLoading, refetch: refetchDb } = useCachedOrderHistory();
  const { isSyncing, metadata } = useAutoSyncOrders();
  const syncMutation = useSyncOrderHistory();
  const { data: syncMeta } = useSyncMetadata();
  const [period, setPeriod] = useState<TimePeriod>('30d');

  // Map DB data to C2COrderHistoryItem shape
  const allOrders: C2COrderHistoryItem[] = useMemo(() => {
    if (!Array.isArray(cachedOrders)) return [];
    return cachedOrders.map((o: any) => ({
      orderNumber: o.orderNumber || '',
      advNo: o.advNo || '',
      tradeType: o.tradeType || '',
      asset: o.asset || 'USDT',
      fiatUnit: o.fiatUnit || 'INR',
      orderStatus: String(o.orderStatus || ''),
      amount: String(o.amount || '0'),
      totalPrice: String(o.totalPrice || '0'),
      unitPrice: String(o.unitPrice || '0'),
      commission: String(o.commission || '0'),
      counterPartNickName: o.counterPartNickName || '',
      createTime: o.createTime || 0,
      payMethodName: o.payMethodName,
    }));
  }, [cachedOrders]);

  // Filter orders by selected period
  const orders = useMemo(() => {
    const { startTimestamp } = getTimestampsForPeriod(period);
    return allOrders.filter(o => o.createTime >= startTimestamp);
  }, [allOrders, period]);

  const stats = useMemo(() => computeOrderStats(orders), [orders]);

  const periodLabel = period === '7d' ? 'Last 7 Days' : period === '30d' ? 'Last 30 Days' : 'Last 1 Year';

  const lastSyncLabel = syncMeta?.last_sync_at
    ? `Synced ${new Date(syncMeta.last_sync_at).toLocaleTimeString()}`
    : 'Never synced';

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Dashboard</h1>
          <p className="text-xs text-muted-foreground mt-0.5">P2P Trading Operations · {periodLabel}</p>
        </div>
        <div className="flex items-center gap-3">
          <TimePeriodFilter value={period} onChange={setPeriod} />
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Database className="h-3 w-3" />
            <span>{orders.length.toLocaleString()} orders</span>
            <span className="text-muted-foreground/50">·</span>
            <span>{lastSyncLabel}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() => syncMutation.mutate({ fullSync: false })}
            disabled={isSyncing || syncMutation.isPending}
            title="Sync orders from Binance"
          >
            <CloudDownload className={`h-3.5 w-3.5 ${isSyncing || syncMutation.isPending ? 'animate-pulse' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Syncing indicator */}
      {(isSyncing || syncMutation.isPending) && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary/5 border border-primary/20 text-xs text-primary">
          <RefreshCw className="h-3 w-3 animate-spin" />
          Syncing orders from Binance API...
        </div>
      )}

      {/* Metric cards */}
      <MetricCards
        activeOrders={stats.activeOrders}
        pendingPayments={stats.pendingPayments}
        completedToday={stats.completedToday}
        appeals={stats.appeals}
        totalVolume={stats.totalVolume}
        avgOrderSize={stats.avgOrderSize}
        completionRate={stats.completionRate}
        buySellRatio={stats.buySellRatio}
        isLoading={dbLoading}
      />

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TradeVolumeChart orders={orders} isLoading={dbLoading} period={period} />
        <OrderStatusBreakdown orders={orders} isLoading={dbLoading} />
      </div>

      {/* Widgets row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AdPerformanceWidget />
        <OperationalAlerts orders={orders} isLoading={dbLoading} />
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

        <Link to="/terminal/orders">
          <Card className="bg-card border-border hover:border-primary/30 transition-colors cursor-pointer group">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <ShoppingCart className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">Orders</h3>
                <p className="text-[11px] text-muted-foreground">View & manage P2P orders</p>
              </div>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
