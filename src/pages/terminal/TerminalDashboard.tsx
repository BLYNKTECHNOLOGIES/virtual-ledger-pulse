import { useMemo, useState, useCallback } from 'react';
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
import { syncCompletedBuyOrders } from '@/hooks/useTerminalPurchaseSync';
import { syncCompletedSellOrders } from '@/hooks/useTerminalSalesSync';
import { syncSmallSales } from '@/hooks/useSmallSalesSync';
import { syncSmallBuys } from '@/hooks/useSmallBuysSync';
import { syncSpotTradesFromBinance, syncSpotTradesToConversions } from '@/hooks/useSpotTradeSyncStandalone';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function TerminalDashboard() {
  const { data: cachedOrders = [], isLoading: dbLoading, refetch: refetchDb } = useCachedOrderHistory();
  const { isSyncing, metadata } = useAutoSyncOrders();
  const syncMutation = useSyncOrderHistory();
  const { data: syncMeta } = useSyncMetadata();
  const [period, setPeriod] = useState<TimePeriod>('30d');
  const [universalSyncing, setUniversalSyncing] = useState(false);

  // Universal sync: triggers all terminal sync operations in parallel
  const handleUniversalSync = useCallback(async () => {
    setUniversalSyncing(true);
    toast.info('Universal sync started — syncing orders, purchases, sales, assets...');

    const results: string[] = [];
    const errors: string[] = [];

    try {
      // Run all syncs in parallel
      const [orderResult, purchaseResult, salesResult, smallSalesResult, smallBuysResult, assetResult, spotTradeResult, spotConvResult] = await Promise.allSettled([
        // 1. Order history sync
        new Promise<string>((resolve, reject) => {
          syncMutation.mutate(
            { fullSync: false },
            {
              onSuccess: () => resolve('Orders synced'),
              onError: (err: any) => reject(err?.message || 'Order sync failed'),
            }
          );
        }),
        // 2. Purchase sync (completed BUY orders → terminal_purchase_sync)
        syncCompletedBuyOrders().then(r => `Purchases: ${r.synced} synced, ${r.duplicates} skipped`),
        // 3. Sales sync (completed SELL orders → terminal_sales_sync)
        syncCompletedSellOrders().then(r => `Sales: ${r.synced} synced, ${r.duplicates} skipped`),
        // 4. Small sales sync
        syncSmallSales().then(r => `Small Sales: ${r.synced} synced`).catch(() => 'Small Sales: skipped (not configured)'),
        // 5. Small buys sync
        syncSmallBuys().then(r => `Small Buys: ${r.synced} synced`).catch(() => 'Small Buys: skipped (not configured)'),
        // 6. Asset movement sync
        supabase.functions.invoke('binance-assets', {
          body: { action: 'syncAssetMovements', force: false },
        }).then(() => 'Asset movements synced'),
        // 7. Spot trade sync from Binance
        syncSpotTradesFromBinance().then(r => `Spot Trades: ${r.synced} synced`),
        // 8. Spot trades → ERP conversions
        syncSpotTradesToConversions().then(r => `Spot Conversions: ${r.inserted} created`).catch(() => 'Spot Conversions: skipped'),
      ]);

      // Collect results
      for (const r of [orderResult, purchaseResult, salesResult, smallSalesResult, smallBuysResult, assetResult, spotTradeResult, spotConvResult]) {
        if (r.status === 'fulfilled') {
          results.push(r.value);
        } else {
          errors.push(String(r.reason));
        }
      }

      if (errors.length === 0) {
        toast.success('Universal sync complete', {
          description: results.join(' · '),
        });
      } else {
        toast.warning(`Sync partially complete (${errors.length} errors)`, {
          description: [...results, ...errors.map(e => `❌ ${e}`)].join(' · '),
        });
      }
    } catch (err: any) {
      toast.error('Universal sync failed', { description: err.message });
    } finally {
      setUniversalSyncing(false);
      refetchDb();
    }
  }, [syncMutation, refetchDb]);

  const isAnySyncing = isSyncing || syncMutation.isPending || universalSyncing;

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

  const periodLabel = period === '1d' ? 'Last 24 Hours' : period === '7d' ? 'Last 7 Days' : period === '30d' ? 'Last 30 Days' : 'Last 1 Year';

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
            onClick={handleUniversalSync}
            disabled={isAnySyncing}
            title="Universal Sync — orders, purchases, sales, assets"
          >
            <CloudDownload className={`h-3.5 w-3.5 ${isAnySyncing ? 'animate-pulse' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Syncing indicator */}
      {isAnySyncing && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary/5 border border-primary/20 text-xs text-primary">
          <RefreshCw className="h-3 w-3 animate-spin" />
          {universalSyncing ? 'Universal sync in progress — orders, purchases, sales, assets...' : 'Syncing orders from Binance API...'}
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
