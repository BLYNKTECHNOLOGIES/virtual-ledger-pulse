import { useMemo, useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { LayoutDashboard, RefreshCw, CloudDownload, AlertTriangle } from 'lucide-react';
import { MetricCards } from '@/components/terminal/dashboard/MetricCards';
import { TradeVolumeChart } from '@/components/terminal/dashboard/TradeVolumeChart';
import { AdPerformanceWidget } from '@/components/terminal/dashboard/AdPerformanceWidget';
import { OperationalAlerts } from '@/components/terminal/dashboard/OperationalAlerts';
import { OrderStatusBreakdown } from '@/components/terminal/dashboard/OrderStatusBreakdown';
import {
  TimePeriodFilter,
  TimeFilter,
  getTimestampsForFilter,
  makeShiftPredicate,

  getFilterLabel,
  serializeTimeFilter,
  deserializeTimeFilter,
} from '@/components/terminal/dashboard/TimePeriodFilter';
import { computeOrderStats, C2COrderHistoryItem } from '@/hooks/useBinanceOrders';
import { useOrderSummary, useOrderWindowPlan } from '@/hooks/useOrderSummary';
import { mergeStatsWithSummary } from '@/lib/orderSummary';
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
import { formatAge, formatIstDateTime, formatIstWhen } from '@/components/terminal/dashboard/dashFormat';
import { useFocusAfterRetry, useOlderThan, useRetryHold } from '@/components/terminal/dashboard/dashHooks';
import { cn } from '@/lib/utils';

// Section eyebrow on the page canvas (foreground at 80%: as soft as muted text in the dark
// theme, above 4.5:1 in the light theme).
const SECTION_TITLE = 'text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/80';
// Auto-sync runs every 5 minutes while a Terminal page is open; older than this means syncs are not landing.
const SYNC_STALE_MS = 15 * 60 * 1000;

export default function TerminalDashboard() {
  const { isSyncing, metadata } = useAutoSyncOrders();
  const syncMutation = useSyncOrderHistory();
  const { data: syncMeta, isLoading: syncMetaLoading, isError: syncMetaError } = useSyncMetadata();
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
  // Orders older than 45 days can no longer change, so their totals come from
  // shared pre-computed buckets; only the recent tail is downloaded row by row.
  const windowPlan = useOrderWindowPlan(filter, filterBounds);
  const {
    aggregate: sealedSummary, isLoading: summaryLoading, isError: summaryError, isFetching: summaryFetching,
    isPlaceholderData: summaryPlaceholder, dataUpdatedAt: summaryUpdatedAt, refetch: refetchSummary,
  } = useOrderSummary(windowPlan);
  const {
    data: cachedOrders = [], isLoading: rawLoading, isError: rawError, isFetching: rawFetching,
    isPlaceholderData: rawPlaceholder, dataUpdatedAt: rawUpdatedAt, refetch: refetchDb,
  } = useCachedOrderHistory(windowPlan.rawRange);
  const dbLoading = rawLoading || (windowPlan.usesSummary && summaryLoading);


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

  // Re-filter client-side: with a shift selected, each day in the window keeps
  // only that shift's slice, so the plain outer bounds are not enough.
  const inShiftWindow = useMemo(() => makeShiftPredicate(filter), [filter]);
  const orders = useMemo(
    () => allOrders.filter(o => inShiftWindow(o.createTime)),
    [allOrders, inShiftWindow]
  );

  const stats = useMemo(
    () => {
      const tail = computeOrderStats(orders, windowPlan.rawRange, inShiftWindow);
      return windowPlan.usesSummary ? mergeStatsWithSummary(tail, sealedSummary) : tail;
    },
    [orders, windowPlan, inShiftWindow, sealedSummary]
  );
  const totalOrderCount = orders.length + (windowPlan.usesSummary ? sealedSummary.totalOrders : 0);


  // ── Live workflow counts ──────────────────────────────────────────────
  // Active / Awaiting Payment / Awaiting Release / Appeals reflect the CURRENT
  // live state of open orders, which the cached history table cannot do (its
  // statuses are frozen at the last sync). Binance's listActiveOrders endpoint
  // is the source of truth for these and is polled every 5s.
  const { data: activeOrdersData, isLoading: liveLoading, errorUpdateCount: liveErrors, dataUpdatedAt: liveUpdatedAt } = useBinanceActiveOrders();
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

  const lastSyncAt = syncMeta?.last_sync_at ? new Date(syncMeta.last_sync_at).getTime() : null;
  const syncOld = useOlderThan(lastSyncAt, SYNC_STALE_MS);
  const syncLabel = isAnySyncing
    ? universalSyncing ? 'Universal sync running…' : 'Syncing orders…'
    : lastSyncAt ? `Synced ${formatIstWhen(lastSyncAt)}`
    : syncMetaLoading ? 'Checking last sync…'
    : syncMetaError ? 'Sync status unavailable'
    : 'Never synced';
  const syncTitle = isAnySyncing
    ? universalSyncing ? 'Universal sync in progress — orders, purchases, sales, assets' : 'Syncing orders from Binance'
    : lastSyncAt ? `Last order sync: ${formatIstDateTime(lastSyncAt)}${syncOld ? ` (${formatAge(Date.now() - lastSyncAt)} ago)` : ''}`
    : syncMetaLoading ? 'Reading the last sync time'
    : syncMetaError ? "The last sync time couldn't be read"
    : 'Orders have not been synced yet';

  // One selected day (or a one-day range): the volume chart plots by hour.
  const isSingleDay = filter.mode === '1d' || (filter.mode === 'range' && filter.from.toDateString() === filter.to.toDateString());
  // A rolling window ends at the moment it was chosen and stays there until the period
  // changes. Natural window ends (midnight, shift edges) fall on a half hour; a shift that
  // has not started yet has no window at all.
  const periodEndsAt =
    filterBounds.endTimestamp > filterBounds.startTimestamp && filterBounds.endTimestamp % 1800000 !== 0
      ? filterBounds.endTimestamp
      : null;
  // A failing live query re-enters "loading" on every retry; once it has failed, keep saying so.
  const liveSource = liveStats ? 'live' : liveLoading && liveErrors === 0 ? 'loading' : 'history';

  // Read failures. "Missing" = nothing was ever loaded for this period; otherwise a refresh
  // failed and the last loaded figures stay on screen.
  const rawMissing = rawError && rawUpdatedAt === 0;
  const summaryMissing = windowPlan.usesSummary && summaryError && summaryUpdatedAt === 0;
  const sealedOrders = windowPlan.usesSummary ? sealedSummary.totalOrders : 0;
  const loadFailed = rawError || (windowPlan.usesSummary && summaryError);
  // Nothing at all could be read for the period: panels say so instead of showing zeros.
  const periodUnavailable = !dbLoading && ((rawMissing && sealedOrders === 0) || (summaryMissing && orders.length === 0));
  // Right after a period change the previous period's rows stay on screen until the new read
  // lands. With nothing of them left in the new period the panels shimmer; otherwise the
  // figures are dimmed and marked "Updating…".
  const periodPlaceholder = rawPlaceholder || (windowPlan.usesSummary && summaryPlaceholder);
  const periodPending = periodPlaceholder && orders.length === 0 && sealedOrders === 0;
  const periodUpdating = periodPlaceholder && !periodPending;
  const periodLoading = dbLoading || periodPending;
  // Retry re-runs only the read that failed; the strip stays (with its button) while it runs.
  const retryBusy = rawFetching || (windowPlan.usesSummary && summaryFetching);
  const [retrying, holdRetry] = useRetryHold(retryBusy);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useFocusAfterRetry(retrying, loadFailed, titleRef);
  const stripText = retrying
    ? 'Loading order history again…'
    : rawMissing || summaryMissing
      ? "Order history for this period couldn't be loaded, so the figures below may be incomplete."
      : "Couldn't refresh order history — showing the last loaded figures.";

  return (
    <TerminalPermissionGate permissions={['terminal_dashboard_view']}>
    <div className="p-3 sm:p-4 md:p-6 space-y-5">
      {/* Command strip */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg border border-primary/20 shrink-0">
            <LayoutDashboard className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 ref={titleRef} tabIndex={-1} className="text-lg font-semibold leading-tight text-foreground focus:outline-none">Dashboard</h1>
            <div className="mt-0.5 text-xs text-muted-foreground">
              <span className="hidden sm:inline">P2P trading overview · </span>{periodLabel}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-card px-2.5 text-[11px] text-muted-foreground"
            title={syncTitle}
          >
            {isAnySyncing ? (
              <RefreshCw className="h-3 w-3 animate-spin text-primary" aria-hidden="true" />
            ) : (
              <span
                className={cn('h-1.5 w-1.5 rounded-full', lastSyncAt ? (syncOld ? 'bg-warning' : 'bg-trade-buy') : 'bg-muted-foreground')}
                aria-hidden="true"
              />
            )}
            <span className={isAnySyncing ? 'text-primary' : syncOld ? 'text-warning' : undefined}>{syncLabel}</span>
            <span className="text-muted-foreground/50" aria-hidden="true">·</span>
            <span className="t-mono tabular-nums" title="Orders in the selected period">
              {periodUnavailable || dbLoading || periodPlaceholder ? '—' : totalOrderCount.toLocaleString('en-IN')} {totalOrderCount === 1 ? 'order' : 'orders'}
            </span>
          </div>
          {canExport && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={handleUniversalSync}
              disabled={isAnySyncing}
              title="Universal Sync — orders, purchases, sales, assets"
              aria-label="Universal sync — orders, purchases, sales, assets"
            >
              <CloudDownload className={`h-3.5 w-3.5 ${isAnySyncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Universal sync</span>
            </Button>
          )}
        </div>
      </div>

      {/* Period and shift */}
      <TimePeriodFilter value={filter} onChange={setFilter} />

      {/* A failed order read shows here instead of silently showing zeros */}
      {(loadFailed || retrying) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2" role="alert">
          <div className="flex items-center gap-2 text-xs text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {stripText}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs aria-disabled:opacity-60"
            aria-disabled={retryBusy || undefined}
            onClick={() => {
              if (retryBusy) return;
              holdRetry();
              if (rawError) refetchDb();
              if (windowPlan.usesSummary && summaryError) refetchSummary();
            }}
          >
            <RefreshCw className={cn('h-3 w-3', retryBusy && 'animate-spin')} aria-hidden="true" />
            {retrying ? 'Retrying…' : 'Retry'}
          </Button>
        </div>
      )}

      {/* Metric strips: open orders now, then the selected period */}
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
        isLoading={periodLoading}
        periodLabel={periodLabel}
        liveSource={liveSource}
        liveUpdatedAt={liveUpdatedAt}
        liveUnavailable={rawMissing}
        periodUnavailable={periodUnavailable}
        periodEndsAt={periodEndsAt}
        periodUpdating={periodUpdating}
      />

      {/* Activity */}
      <section className="@container space-y-2" aria-label="Activity">
        <div role="heading" aria-level={2} className={SECTION_TITLE}>Activity</div>
        <div className={cn('grid grid-cols-1 gap-4 transition-opacity duration-150 @[52rem]:grid-cols-5', periodUpdating && 'opacity-60')}>
          <div className="min-w-0 @[52rem]:col-span-3">
            <TradeVolumeChart
              precomputedSeries={windowPlan.usesSummary ? sealedSummary.series : undefined}
              orders={orders}
              isLoading={periodLoading}
              period={filter.mode === '1d' || filter.mode === 'range' ? '1d' : filter.mode}
              hourWindow={isSingleDay ? filterBounds : undefined}
              bounds={filterBounds}
              endsLabel={periodEndsAt && !rawMissing ? formatIstWhen(periodEndsAt) : null}
              unavailable={periodUnavailable}
            />
          </div>
          <div className="min-w-0 @[52rem]:col-span-2">
            <OrderStatusBreakdown orders={orders} isLoading={periodLoading} precomputedCounts={windowPlan.usesSummary ? sealedSummary.statusCounts : undefined} unavailable={periodUnavailable} />
          </div>
        </div>
      </section>

      {/* Ads and alerts */}
      <section className="@container space-y-2" aria-label="Ads and alerts">
        <div role="heading" aria-level={2} className={SECTION_TITLE}>Ads &amp; alerts</div>
        <div className="grid grid-cols-1 gap-4 @[44rem]:grid-cols-2">
          <AdPerformanceWidget />
          <OperationalAlerts
            orders={orders}
            isLoading={periodLoading}
            unavailable={rawMissing || periodUnavailable}
            pending={rawPlaceholder}
            olderOnly={!rawPlaceholder && orders.length === 0 && windowPlan.usesSummary}
          />
        </div>
      </section>
    </div>
    </TerminalPermissionGate>
  );
}
