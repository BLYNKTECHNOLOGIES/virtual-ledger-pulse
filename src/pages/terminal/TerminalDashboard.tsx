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
import {
  TimePeriodFilter,
  TimeFilter,
  getTimestampsForFilter,
  getFilterLabel,
  serializeTimeFilter,
  deserializeTimeFilter,
} from '@/components/terminal/dashboard/TimePeriodFilter';
import { computeOrderStats, C2COrderHistoryItem } from '@/hooks/useBinanceOrders';
import { useBinanceActiveOrders } from '@/hooks/useBinanceActions';
import { useCachedOrderHistory, useAutoSyncOrders, useSyncOrderHistory, useSyncMetadata } from '@/hooks/useBinanceOrderSync';
import { syncCompletedBuyOrders } from '@/hooks/useTerminalPurchaseSync';
import { syncCompletedSellOrders } from '@/hooks/useTerminalSalesSync';
// Small Buys/Sales sync intentionally NOT imported here — use dedicated buttons only.
import { syncSpotTradesFromBinance, syncSpotTradesToConversions } from '@/hooks/useSpotTradeSyncStandalone';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTerminalAuth } from '@/hooks/useTerminalAuth';
import { useTerminalUserPrefs } from '@/hooks/useTerminalUserPrefs';
import { TerminalPermissionGate } from '@/components/terminal/TerminalPermissionGate';

export default function TerminalDashboard() {
  const { isSyncing, metadata } = useAutoSyncOrders();
  const syncMutation = useSyncOrderHistory();
  const { data: syncMeta } = useSyncMetadata();
  const { userId, hasPermission, isTerminalAdmin } = useTerminalAuth();
  const canExport = hasPermission('terminal_dashboard_export') || isTerminalAdmin;
  const [prefs, setPref] = useTerminalUserPrefs(userId, 'dashboard', { filter: '' as string });

  // Deserialize filter from prefs
  const filter: TimeFilter = useMemo(() => deserializeTimeFilter(prefs.filter || undefined), [prefs.filter]);
  const setFilter = useCallback(
    (f: TimeFilter) => setPref('filter', serializeTimeFilter(f)),
    [setPref]
  );

  // Scope the DB read to the selected window so we only load the rows we
  // actually display, instead of fetching a full year of orders on every visit.
  const filterBounds = useMemo(() => getTimestampsForFilter(filter), [filter]);
  const { data: cachedOrders = [], isLoading: dbLoading, refetch: refetchDb } = useCachedOrderHistory(filterBounds);

  const [universalSyncing, setUniversalSyncing] = useState(false);

  // Universal sync: triggers all terminal sync operations in parallel
  const handleUniversalSync = useCallback(async () => {
    setUniversalSyncing(true);
    toast.info('Universal sync started — syncing orders, purchases, sales, assets...');

    const results: string[] = [];
    const errors: string[] = [];

    try {
      // NOTE: Small Buys / Small Sales are intentionally EXCLUDED from Universal Sync.
      // They must only be generated via the dedicated "Sync Small …" buttons so operators
      // do not get unexpected SM- batches every time they hit Universal Sync.
      const [orderResult, purchaseResult, salesResult, assetResult, spotTradeResult, spotConvResult] = await Promise.allSettled([
        new Promise<string>((resolve, reject) => {
          syncMutation.mutate(
            { fullSync: false },
            {
              onSuccess: () => resolve('Orders synced'),
              onError: (err: any) => reject(err?.message || 'Order sync failed'),
            }
          );
        }),
        syncCompletedBuyOrders().then(r => `Purchases: ${r.synced} synced, ${r.duplicates} skipped`),
        syncCompletedSellOrders().then(r => `Sales: ${r.synced} synced, ${r.duplicates} skipped`),
        supabase.functions.invoke('binance-assets', {
          body: { action: 'syncAssetMovements', force: false },
        }).then(() => 'Asset movements synced'),
        syncSpotTradesFromBinance().then(r => `Spot Trades: ${r.synced} synced`),
        syncSpotTradesToConversions().then(r => `Spot Conversions: ${r.inserted} created`).catch(() => 'Spot Conversions: skipped'),
      ]);

      for (const r of [orderResult, purchaseResult, salesResult, assetResult, spotTradeResult, spotConvResult]) {
        if (r.status === 'fulfilled') results.push(r.value);
        else errors.push(String(r.reason));
      }

      if (errors.length === 0) {
        toast.success('Universal sync complete', { description: results.join(' · ') });
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

  // Re-filter client-side as a safety net (DB read is already scoped to the window)
  const orders = useMemo(() => {
    const { startTimestamp, endTimestamp } = filterBounds;
    return allOrders.filter(o => o.createTime >= startTimestamp && o.createTime <= endTimestamp);
  }, [allOrders, filterBounds]);

  const stats = useMemo(() => computeOrderStats(orders, filterBounds), [orders, filterBounds]);

  // ── Live workflow counts ──────────────────────────────────────────────
  // Active / Awaiting Payment / Awaiting Release / Appeals reflect the CURRENT
  // live state of open orders, which the cached history table cannot do (its
  // statuses are frozen at the last sync). Binance's listActiveOrders endpoint
  // is the source of truth for these and is polled every 5s.
  const { data: activeOrdersData } = useBinanceActiveOrders();
  const liveStats = useMemo(() => {
    const list = (activeOrdersData as any)?.data || (activeOrdersData as any)?.list || activeOrdersData;
    if (!Array.isArray(list)) return null;
    let activeOrders = 0, awaitingPayment = 0, awaitingRelease = 0, appeals = 0;
    for (const o of list) {
      // Binance returns numeric orderStatus on the active endpoint:
      // 1 TRADING · 2/3 BUYER_PAYED · 5/8 APPEAL
      const s = typeof o.orderStatus === 'number' ? o.orderStatus : Number(o.orderStatus);
      if (s === 1) { activeOrders++; awaitingPayment++; }
      else if (s === 2 || s === 3) { activeOrders++; awaitingRelease++; }
      else if (s === 5 || s === 8) { activeOrders++; appeals++; }
    }
    return { activeOrders, awaitingPayment, awaitingRelease, appeals };
  }, [activeOrdersData]);

  // Prefer live counts for workflow states; fall back to cached history when the
  // live endpoint is unavailable so the cards never go blank.
  const activeOrders = liveStats?.activeOrders ?? stats.activeOrders;
  const awaitingPayment = liveStats?.awaitingPayment ?? stats.awaitingPayment;
  const awaitingRelease = liveStats?.awaitingRelease ?? stats.awaitingRelease;
  const appeals = liveStats?.appeals ?? stats.appeals;

  const periodLabel = getFilterLabel(filter);

  const lastSyncLabel = syncMeta?.last_sync_at
    ? `Synced ${new Date(syncMeta.last_sync_at).toLocaleTimeString()}`
    : 'Never synced';

  return (
    <TerminalPermissionGate permissions={['terminal_dashboard_view']}>
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Dashboard</h1>
          <p className="text-xs text-muted-foreground mt-0.5">P2P Trading Operations · {periodLabel}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <TimePeriodFilter value={filter} onChange={setFilter} />
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Database className="h-3 w-3" />
            <span>{orders.length.toLocaleString('en-IN')} orders</span>
            <span className="text-muted-foreground/50">·</span>
            <span>{lastSyncLabel}</span>
          </div>
          {canExport && (
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
          )}
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
        activeOrders={activeOrders}
        awaitingPayment={awaitingPayment}
        awaitingRelease={awaitingRelease}
        completedInPeriod={stats.completedInPeriod}
        appeals={appeals}
        totalBuyVolume={stats.totalBuyVolume}
        totalSellVolume={stats.totalSellVolume}
        avgOrderSize={stats.avgOrderSize}
        completionRate={stats.completionRate}
        buySellRatio={stats.buySellRatio}
        isLoading={dbLoading}
        periodLabel={periodLabel}
      />

      {/* Charts row */}
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Activity</p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TradeVolumeChart orders={orders} isLoading={dbLoading} period={filter.mode === '1d' || filter.mode === 'range' ? '1d' : filter.mode} />
        <OrderStatusBreakdown orders={orders} isLoading={dbLoading} />
      </div>

      {/* Widgets row */}
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Ads &amp; Alerts</p>
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
    </TerminalPermissionGate>
  );
}
