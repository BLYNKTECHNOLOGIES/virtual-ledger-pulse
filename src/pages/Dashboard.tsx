import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowUpIcon, ArrowDownIcon, DollarSign, TrendingUp, Users, Wallet, Settings, RefreshCw, BarChart3, Activity, Zap, Calendar, Package, GripVertical, CloudDownload, RotateCcw } from "lucide-react";
import { useSidebarEdit } from "@/contexts/SidebarEditContext";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import { DraggableDashboardSection } from "@/components/dashboard/DraggableDashboardSection";
import type { WidgetSize } from "@/components/dashboard/DraggableDashboardSection";
import { AddWidgetDialog, builtInWidgets, widgetRegistry } from "@/components/dashboard/AddWidgetDialog";
import type { WidgetType } from "@/components/dashboard/AddWidgetDialog";
import DashboardWidget from "@/components/dashboard/DashboardWidget";
import { ShiftReconciliationWidget } from "@/components/dashboard/ShiftReconciliationWidget";
import { ActionRequiredWidget } from "@/components/dashboard/ActionRequiredWidget";
import { QuickLinksWidget } from "@/components/dashboard/QuickLinksWidget";
import { InteractiveHeatmap } from "@/components/dashboard/InteractiveHeatmap";
import { MyTasksWidget } from "@/components/dashboard/widgets/MyTasksWidget";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { syncCompletedBuyOrders } from '@/hooks/useTerminalPurchaseSync';
import { syncCompletedSellOrders } from '@/hooks/useTerminalSalesSync';
import { syncSmallSales } from '@/hooks/useSmallSalesSync';
import { syncSmallBuys } from '@/hooks/useSmallBuysSync';
import { syncSpotTradesFromBinance, syncSpotTradesToConversions } from '@/hooks/useSpotTradeSyncStandalone';
import { useSyncOrderHistory } from '@/hooks/useBinanceOrderSync';
import { toast as sonnerToast } from 'sonner';
import { DateRange } from "react-day-picker";
import { DateRangePicker, DateRangePreset, getDateRangeFromPreset } from "@/components/ui/date-range-picker";
import { ClickableCard, buildTransactionFilters } from "@/components/ui/clickable-card";
import { fetchActiveWalletsWithLedgerUsdtBalance } from "@/lib/wallet-ledger-balance";

// Default active widgets for new users (built-in IDs)
const DEFAULT_ACTIVE_WIDGETS = [
  'metric-total-sales', 'metric-sales-orders', 'metric-total-clients', 'metric-total-cash',
  'action-required', 'quick-links',
  'heatmap', 'recent-activity',
];

// Grid span config for built-in widgets
const GRID_SPAN: Record<string, number> = {
  'metric-total-sales': 3,
  'metric-sales-orders': 3,
  'metric-total-clients': 3,
  'metric-total-cash': 3,
  'action-required': 12,
  'quick-links': 12,
  'heatmap': 8,
  'recent-activity': 4,
};

// Map widget size to grid span
function sizeToSpan(size?: string): number {
  if (size === 'large') return 12;
  if (size === 'medium') return 6;
  return 3; // small
}

function getWidgetSpan(widgetId: string, customSpans?: Record<string, number>): number {
  // Custom user-set span takes priority
  if (customSpans && customSpans[widgetId] !== undefined) return customSpans[widgetId];
  if (GRID_SPAN[widgetId] !== undefined) return GRID_SPAN[widgetId];
  // Then check registry gridSpan or size
  const def = widgetRegistry.get(widgetId);
  if (def?.gridSpan) return def.gridSpan;
  return sizeToSpan(def?.size);
}

function getColClass(widgetId: string): string {
  const span = getWidgetSpan(widgetId);
  if (span <= 3) return 'col-span-6 lg:col-span-3';
  if (span === 4) return 'col-span-12 lg:col-span-4';
  if (span === 6) return 'col-span-12 lg:col-span-6';
  if (span === 8) return 'col-span-12 lg:col-span-8';
  return 'col-span-12';
}

// Calculate adaptive spans so widgets fill rows (12-col grid)
function getAdaptiveColClasses(widgetIds: string[], customSpans?: Record<string, number>): Record<string, string> {
  const result: Record<string, string> = {};
  let i = 0;
  while (i < widgetIds.length) {
    // Collect widgets for this row
    const rowWidgets: { id: string; span: number }[] = [];
    let rowTotal = 0;
    let j = i;
    while (j < widgetIds.length) {
      const span = getWidgetSpan(widgetIds[j], customSpans);
      if (span >= 12) {
        // Full-width widget gets its own row
        if (rowWidgets.length === 0) {
          rowWidgets.push({ id: widgetIds[j], span: 12 });
          j++;
        }
        break;
      }
      if (rowTotal + span > 12 && rowWidgets.length > 0) break;
      rowWidgets.push({ id: widgetIds[j], span });
      rowTotal += span;
      j++;
    }

    // If row doesn't fill 12 cols, distribute remaining space
    if (rowWidgets.length > 0 && rowTotal < 12 && rowTotal > 0) {
      const firstWidget = rowWidgets[0];
      if (firstWidget.span >= 12) {
        // Full-width, no change
      } else {
        // Distribute extra space proportionally
        const extra = 12 - rowTotal;
        const extraPerWidget = Math.floor(extra / rowWidgets.length);
        let remainder = extra - extraPerWidget * rowWidgets.length;
        for (const w of rowWidgets) {
          w.span += extraPerWidget;
          if (remainder > 0) { w.span += 1; remainder--; }
        }
      }
    }

    for (const w of rowWidgets) {
      const s = w.span;
      if (s <= 3) result[w.id] = 'col-span-6 lg:col-span-3';
      else if (s === 4) result[w.id] = 'col-span-12 lg:col-span-4';
      else if (s === 5) result[w.id] = 'col-span-12 lg:col-span-5';
      else if (s === 6) result[w.id] = 'col-span-12 lg:col-span-6';
      else if (s === 7) result[w.id] = 'col-span-12 lg:col-span-7';
      else if (s === 8) result[w.id] = 'col-span-12 lg:col-span-8';
      else if (s === 9) result[w.id] = 'col-span-12 lg:col-span-9';
      else result[w.id] = 'col-span-12';
    }
    i = j;
  }
  return result;
}

export default function Dashboard() {
  const { user } = useAuth();
  const userId = user?.id || 'default';
  const { hasAnyPermission } = usePermissions();
  const [datePreset, setDatePreset] = useState<DateRangePreset>("last7days");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(getDateRangeFromPreset("last7days"));
  const [isEditMode, setIsEditMode] = useState(false);
  const { isDashboardRearrangeMode: isRearrangeMode, setIsDashboardRearrangeMode: setIsRearrangeMode } = useSidebarEdit();
  const { toast } = useToast();

  // ── Unified active widget list (ordered IDs) — per-user persistence ──
  const storageKey = useMemo(() => userId !== 'default' ? `dashboardActiveWidgets_${userId}` : null, [userId]);
  const spansStorageKey = useMemo(() => userId !== 'default' ? `dashboardWidgetSpans_${userId}` : null, [userId]);

  const readWidgetIds = useCallback((key: string | null): string[] => {
    let ids: string[] = [...DEFAULT_ACTIVE_WIDGETS];
    if (!key) return ids;
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        ids = JSON.parse(saved);
      } else {
        // Migration: check old format
        const uid = key.replace('dashboardActiveWidgets_', '');
        const oldOrder = localStorage.getItem(`dashboardItemOrder_${uid}`);
        const oldWidgets = localStorage.getItem(`dashboardWidgets_${uid}`);
        if (oldOrder || oldWidgets) {
          ids = oldOrder ? JSON.parse(oldOrder) : [...DEFAULT_ACTIVE_WIDGETS];
          if (oldWidgets) {
            const widgets = JSON.parse(oldWidgets) as { id: string }[];
            widgets.forEach(w => { if (!ids.includes(w.id)) ids.push(w.id); });
          }
          localStorage.removeItem(`dashboardItemOrder_${uid}`);
          localStorage.removeItem(`dashboardWidgets_${uid}`);
        }
      }
    } catch { /* ignore */ }
    // Deduplicate while preserving order
    const seen = new Set<string>();
    ids = ids.filter(id => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    if (key) localStorage.setItem(key, JSON.stringify(ids));
    return ids;
  }, []);

  const readSpans = useCallback((key: string | null): Record<string, number> => {
    if (!key) return {};
    try {
      const saved = localStorage.getItem(key);
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return {};
  }, []);

  const [activeWidgetIds, setActiveWidgetIds] = useState<string[]>(() => readWidgetIds(storageKey));
  const [customSpans, setCustomSpans] = useState<Record<string, number>>(() => readSpans(spansStorageKey));

  // Re-load both when the authenticated user changes (e.g. login, page refresh)
  useEffect(() => {
    setActiveWidgetIds(readWidgetIds(storageKey));
    setCustomSpans(readSpans(spansStorageKey));
  }, [storageKey, spansStorageKey, readWidgetIds, readSpans]);

  const handleResizeWidget = useCallback((widgetId: string, span: WidgetSize) => {
    setCustomSpans(prev => {
      const next = { ...prev, [widgetId]: span };
      if (spansStorageKey) localStorage.setItem(spansStorageKey, JSON.stringify(next));
      return next;
    });
  }, [spansStorageKey]);

  // Persist active widgets whenever they change (only for real users)
  useEffect(() => {
    if (storageKey) localStorage.setItem(storageKey, JSON.stringify(activeWidgetIds));
  }, [activeWidgetIds, storageKey]);

  // Filter by permissions
  const visibleWidgetIds = useMemo(() => {
    return activeWidgetIds.filter(id => {
      const def = widgetRegistry.get(id);
      if (!def) return false; // widget no longer exists in registry, remove it
      if (!def.requiredPermissions || def.requiredPermissions.length === 0) return true;
      return hasAnyPermission(def.requiredPermissions);
    });
  }, [activeWidgetIds, hasAnyPermission]);

  // ── Date range ──
  const getDateRangeValues = () => {
    if (dateRange?.from && dateRange?.to) return { start: dateRange.from, end: dateRange.to };
    const now = new Date();
    return { start: subDays(now, 7), end: now };
  };
  const { start: startDate, end: endDate } = getDateRangeValues();

  // ── Data fetching (unchanged logic) ──
  const { data: metrics, refetch: refetchMetrics } = useQuery({
    queryKey: ['dashboard_metrics', dateRange?.from?.toISOString(), dateRange?.to?.toISOString()],
    queryFn: async () => {
      // Calculate previous period of equal length
      const periodMs = endOfDay(endDate).getTime() - startOfDay(startDate).getTime();
      const prevEnd = new Date(startOfDay(startDate).getTime() - 1);
      const prevStart = new Date(prevEnd.getTime() - periodMs);

      const [
        { data: salesData },
        { data: purchaseData },
        { data: prevSalesData },
        { data: prevPurchaseData },
        { data: clientsData },
        { data: totalClientsData },
        { data: bankData },
        { data: productsData },
        { data: walletAssetBalances },
      ] = await Promise.all([
        supabase.from('sales_orders').select('total_amount, created_at')
          .gte('created_at', startOfDay(startDate).toISOString())
          .lte('created_at', endOfDay(endDate).toISOString()),
        supabase.from('purchase_orders').select('total_amount, created_at')
          .gte('created_at', startOfDay(startDate).toISOString())
          .lte('created_at', endOfDay(endDate).toISOString()),
        supabase.from('sales_orders').select('total_amount')
          .gte('created_at', prevStart.toISOString())
          .lte('created_at', prevEnd.toISOString()),
        supabase.from('purchase_orders').select('total_amount')
          .gte('created_at', prevStart.toISOString())
          .lte('created_at', prevEnd.toISOString()),
        supabase.from('clients').select('id').eq('kyc_status', 'VERIFIED'),
        supabase.from('clients').select('id'),
        supabase.from('bank_accounts').select('balance, lien_amount').eq('status', 'ACTIVE').is('dormant_at', null),
        supabase.from('products').select('code, cost_price'),
        supabase.from('wallet_asset_balances').select('asset_code, balance'),
      ]);

      const totalSalesOrders = salesData?.length || 0;
      const totalSales = salesData?.reduce((sum, o) => sum + Number(o.total_amount), 0) || 0;
      const totalPurchases = purchaseData?.length || 0;
      const totalSpending = purchaseData?.reduce((sum, o) => sum + Number(o.total_amount), 0) || 0;
      const verifiedClients = clientsData?.length || 0;
      const totalClients = totalClientsData?.length || 0;

      // Previous period metrics
      const prevTotalSalesOrders = prevSalesData?.length || 0;
      const prevTotalSales = prevSalesData?.reduce((sum, o) => sum + Number(o.total_amount), 0) || 0;

      // Growth rates
      const salesGrowth = prevTotalSales > 0 ? ((totalSales - prevTotalSales) / prevTotalSales) * 100 : (totalSales > 0 ? 100 : 0);
      const ordersGrowth = prevTotalSalesOrders > 0 ? ((totalSalesOrders - prevTotalSalesOrders) / prevTotalSalesOrders) * 100 : (totalSalesOrders > 0 ? 100 : 0);

      const bankBalance = bankData?.reduce((sum, a) => sum + (Number(a.balance) - Number(a.lien_amount || 0)), 0) || 0;

      const costPriceMap: Record<string, number> = {};
      productsData?.forEach(p => { if (p.code) costPriceMap[p.code] = Number(p.cost_price || 0); });

      const assetTotals: Record<string, number> = {};
      walletAssetBalances?.forEach(ab => { assetTotals[ab.asset_code] = (assetTotals[ab.asset_code] || 0) + Number(ab.balance || 0); });

      const stockValue = Object.entries(assetTotals).reduce((sum, [code, balance]) => sum + (balance * (costPriceMap[code] || 0)), 0);
      const totalCash = bankBalance + stockValue;

      return { totalSalesOrders, totalSales, totalPurchases, totalSpending, verifiedClients, totalClients, totalCash, bankBalance, stockValue, totalRevenue: totalSales, salesGrowth, ordersGrowth };
    },
  });

  const { data: warehouseStock, refetch: refetchWarehouseStock } = useQuery({
    queryKey: ['dashboard_asset_inventory'],
    queryFn: async () => {
      const wallets = await fetchActiveWalletsWithLedgerUsdtBalance('id, wallet_name, current_balance');
      let totalWalletStock = 0;
      const walletDistribution: any[] = [];
      wallets?.forEach(w => {
        const balance = Number(w.current_balance) || 0;
        totalWalletStock += balance;
        walletDistribution.push({ name: w.wallet_name, quantity: balance, percentage: 0 });
      });
      walletDistribution.forEach(d => { d.percentage = totalWalletStock > 0 ? (d.quantity / totalWalletStock) * 100 : 0; });
      if (wallets && wallets.length > 0) {
        return [{ id: 'USDT', name: 'USDT', code: 'USDT', total_stock: totalWalletStock, wallet_distribution: walletDistribution.filter(d => d.quantity > 0), unit: 'Units' }];
      }
      return [];
    },
    refetchInterval: 30000,
    staleTime: 10000,
  });

  const { data: recentActivity, refetch: refetchActivity } = useQuery({
    queryKey: ['recent_activity', dateRange?.from?.toISOString(), dateRange?.to?.toISOString()],
    queryFn: async () => {
      const { data: salesOrders } = await supabase
        .from('sales_orders')
        .select('id, order_number, client_name, total_amount, created_at')
        .gte('created_at', startOfDay(startDate).toISOString())
        .lte('created_at', endOfDay(endDate).toISOString())
        .order('created_at', { ascending: false })
        .limit(5);

      const { data: purchaseOrders } = await supabase
        .from('purchase_orders')
        .select('id, order_number, supplier_name, total_amount, created_at')
        .gte('created_at', startOfDay(startDate).toISOString())
        .lte('created_at', endOfDay(endDate).toISOString())
        .order('created_at', { ascending: false })
        .limit(5);

      return [
        ...(salesOrders || []).map(o => ({ id: o.id, type: 'sale', title: `Sale to ${o.client_name}`, amount: o.total_amount, reference: o.order_number, timestamp: o.created_at })),
        ...(purchaseOrders || []).map(o => ({ id: o.id, type: 'purchase', title: `Purchase from ${o.supplier_name}`, amount: o.total_amount, reference: o.order_number, timestamp: o.created_at })),
      ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 10);
    },
  });

  // ── Widget actions ──
  const handleAddWidget = (widget: WidgetType) => {
    setActiveWidgetIds(prev => {
      if (prev.includes(widget.id)) return prev;
      return [...prev, widget.id];
    });
    toast({ title: "Widget Added! 🎉", description: `${widget.name} has been added to your dashboard.` });
  };

  const handleRemoveWidget = (widgetId: string) => {
    setActiveWidgetIds(prev => prev.filter(id => id !== widgetId));
    toast({ title: "Widget Removed", description: "Widget has been removed from your dashboard." });
  };

  const handleResetDashboard = () => {
    setActiveWidgetIds([...DEFAULT_ACTIVE_WIDGETS]);
    setCustomSpans({});
    // Clean up old storage
    localStorage.removeItem(`dashboardItemOrder_${userId}`);
    localStorage.removeItem(`dashboardWidgets_${userId}`);
    if (spansStorageKey) localStorage.removeItem(spansStorageKey);
    toast({ title: "Dashboard Reset", description: "Dashboard has been reset to default layout." });
  };

  // ── DnD ──
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setActiveWidgetIds(prev => {
        const oldIndex = prev.indexOf(active.id as string);
        const newIndex = prev.indexOf(over.id as string);
        if (oldIndex === -1 || newIndex === -1) return prev;
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  };

  // ── Sync logic (unchanged) ──
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [universalSyncing, setUniversalSyncing] = useState(false);
  const syncMutation = useSyncOrderHistory();

  const handleRefreshDashboard = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refetchMetrics(), refetchWarehouseStock(), refetchActivity()]);
      toast({ title: "Dashboard Refreshed", description: "All dashboard data has been refreshed." });
    } finally { setIsRefreshing(false); }
  };

  const handleUniversalSync = useCallback(async () => {
    setUniversalSyncing(true);
    sonnerToast.info('Universal sync started — syncing orders, purchases, sales, assets...');
    const results: string[] = [];
    const errors: string[] = [];
    try {
      const [orderResult, purchaseResult, salesResult, smallSalesResult, smallBuysResult, assetResult, spotTradeResult, spotConvResult] = await Promise.allSettled([
        new Promise<string>((resolve, reject) => {
          syncMutation.mutate({ fullSync: false }, {
            onSuccess: () => resolve('Orders synced'),
            onError: (err: any) => reject(err?.message || 'Order sync failed'),
          });
        }),
        syncCompletedBuyOrders().then(r => `Purchases: ${r.synced} synced, ${r.duplicates} skipped`),
        syncCompletedSellOrders().then(r => `Sales: ${r.synced} synced, ${r.duplicates} skipped`),
        syncSmallSales().then(r => `Small Sales: ${r.synced} synced`).catch(() => 'Small Sales: skipped'),
        syncSmallBuys().then(r => `Small Buys: ${r.synced} synced`).catch(() => 'Small Buys: skipped'),
        supabase.functions.invoke('binance-assets', { body: { action: 'syncAssetMovements', force: false } }).then(() => 'Asset movements synced'),
        syncSpotTradesFromBinance().then(r => `Spot Trades: ${r.synced} synced`),
        syncSpotTradesToConversions().then(r => `Spot Conversions: ${r.inserted} created`).catch(() => 'Spot Conversions: skipped'),
      ]);
      for (const r of [orderResult, purchaseResult, salesResult, smallSalesResult, smallBuysResult, assetResult, spotTradeResult, spotConvResult]) {
        if (r.status === 'fulfilled') results.push(r.value);
        else errors.push(String(r.reason));
      }
      if (errors.length === 0) {
        sonnerToast.success('Universal sync complete', { description: results.join(' · ') });
      } else {
        sonnerToast.warning(`Sync partially complete (${errors.length} errors)`, { description: [...results, ...errors.map(e => `❌ ${e}`)].join(' · ') });
      }
    } catch (err: any) {
      sonnerToast.error('Universal sync failed', { description: err.message });
    } finally {
      setUniversalSyncing(false);
      refetchMetrics(); refetchWarehouseStock(); refetchActivity();
    }
  }, [syncMutation, refetchMetrics, refetchWarehouseStock, refetchActivity]);

  const canDrag = isEditMode || isRearrangeMode;

  // ── Render a built-in section by ID ──
  const renderBuiltInWidget = (widgetId: string) => {
    switch (widgetId) {
      case 'metric-total-sales':
        return (
          <ClickableCard to="/sales" searchParams={buildTransactionFilters({ dateFrom: startDate, dateTo: endDate })}>
            <Card className="bg-white border-2 border-blue-100 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-600 text-sm font-medium">Total Sales</p>
                    <div className="text-xl xl:text-2xl font-bold mt-2 leading-tight break-words text-slate-800">₹{Math.round(metrics?.totalSales || 0).toLocaleString('en-IN')}</div>
                    <div className="flex items-center gap-1 mt-2">
                      {(metrics?.salesGrowth ?? 0) >= 0 ? (
                        <ArrowUpIcon className="h-4 w-4 text-green-500" />
                      ) : (
                        <ArrowDownIcon className="h-4 w-4 text-destructive" />
                      )}
                      <span className={`text-sm font-medium ${(metrics?.salesGrowth ?? 0) >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                        {(metrics?.salesGrowth ?? 0) >= 0 ? '+' : ''}{(metrics?.salesGrowth ?? 0).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div className="bg-green-50 p-3 rounded-xl shadow-sm flex-shrink-0">
                    <DollarSign className="h-8 w-8 text-metric-sales-icon" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </ClickableCard>
        );

      case 'metric-sales-orders':
        return (
          <ClickableCard to="/sales" searchParams={buildTransactionFilters({ dateFrom: startDate, dateTo: endDate })}>
            <Card className="bg-white border-2 border-blue-100 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-600 text-sm font-medium">Sales Orders</p>
                    <p className="text-2xl xl:text-3xl font-bold mt-2 truncate text-slate-800">{metrics?.totalSalesOrders || 0}</p>
                    <div className="flex items-center gap-1 mt-2">
                      {(metrics?.ordersGrowth ?? 0) >= 0 ? (
                        <ArrowUpIcon className="h-4 w-4 text-green-500" />
                      ) : (
                        <ArrowDownIcon className="h-4 w-4 text-destructive" />
                      )}
                      <span className={`text-sm font-medium ${(metrics?.ordersGrowth ?? 0) >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                        {(metrics?.ordersGrowth ?? 0) >= 0 ? '+' : ''}{(metrics?.ordersGrowth ?? 0).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div className="bg-purple-50 p-3 rounded-xl shadow-sm flex-shrink-0">
                    <TrendingUp className="h-8 w-8 text-metric-orders-icon" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </ClickableCard>
        );

      case 'metric-total-clients':
        return (
          <ClickableCard to="/clients">
            <Card className="bg-white border-2 border-blue-100 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-600 text-sm font-medium">Total Clients</p>
                    <div className="text-xl xl:text-2xl font-bold mt-2 leading-tight break-words text-slate-800">{metrics?.totalClients || 0}</div>
                    <div className="flex items-center gap-1 mt-2">
                      <ArrowUpIcon className="h-4 w-4 text-blue-500" />
                      <span className="text-sm font-medium text-slate-500">Verified: {metrics?.verifiedClients || 0}</span>
                    </div>
                  </div>
                  <div className="bg-blue-50 p-3 rounded-xl shadow-sm flex-shrink-0">
                    <Users className="h-8 w-8 text-metric-clients-icon" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </ClickableCard>
        );

      case 'metric-total-cash':
        return (
          <ClickableCard to="/bams">
            <Card className="bg-white border-2 border-blue-100 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0 relative z-10">
                    <p className="text-slate-600 text-sm font-medium">Total Cash</p>
                    <div className="text-xl xl:text-2xl font-bold mt-2 leading-tight break-words text-slate-800">₹{Math.round(metrics?.totalCash || 0).toLocaleString('en-IN')}</div>
                    <div className="flex items-center gap-1 mt-2">
                      <ArrowUpIcon className="h-4 w-4 text-amber-500" />
                      <span className="text-sm font-medium text-slate-500">Banks + Stock</span>
                    </div>
                  </div>
                  <div className="bg-amber-50 p-3 rounded-xl shadow-sm flex-shrink-0 relative z-0">
                    <Wallet className="h-8 w-8 text-metric-cash-icon" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </ClickableCard>
        );

      case 'action-required':
        return <ActionRequiredWidget />;

      case 'quick-links':
        return <QuickLinksWidget onRemove={handleRemoveWidget} />;

      case 'heatmap':
        return <InteractiveHeatmap selectedPeriod={datePreset} />;

      case 'recent-activity':
        return (
          <Card className="bg-card border-2 border-border shadow-xl h-full">
            <CardHeader className="bg-teal-600 text-white rounded-t-lg">
              <CardTitle className="flex items-center gap-2 text-lg">
                <div className="p-2 bg-teal-700 rounded-lg shadow-md"><Activity className="h-5 w-5" /></div>
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4 overflow-y-auto max-h-[500px]">
              {recentActivity?.slice(0, 8).map((activity) => (
                <div key={activity.id} className="flex items-center justify-between p-4 bg-card rounded-xl shadow-sm border-2 border-border hover:shadow-md transition-all duration-200">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${activity.type === 'sale' ? 'bg-emerald-100' : 'bg-muted'}`}>
                      {activity.type === 'sale' ? <ArrowUpIcon className="h-4 w-4 text-emerald-600" /> : <ArrowDownIcon className="h-4 w-4 text-muted-foreground" />}
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-foreground">{activity.title}</p>
                      <p className="text-xs text-muted-foreground">{format(new Date(activity.timestamp), "MMM dd, HH:mm")}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold text-sm ${activity.type === 'sale' ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                      {activity.type === 'sale' ? '+' : '-'}₹{Number(activity.amount).toLocaleString('en-IN')}
                    </p>
                    <p className="text-xs text-muted-foreground">{activity.reference}</p>
                  </div>
                </div>
              ))}
              {(!recentActivity || recentActivity.length === 0) && (
                <div className="text-center py-12 text-muted-foreground">
                  <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4"><Activity className="h-8 w-8 opacity-50" /></div>
                  <p className="font-medium">No activity in selected period</p>
                </div>
              )}
            </CardContent>
          </Card>
        );




      case 'my-tasks':
        return <MyTasksWidget />;

      default:
        return null;
    }
  };

  // ── Compute adaptive col classes for current layout ──
  const adaptiveColClasses = useMemo(() => getAdaptiveColClasses(visibleWidgetIds, customSpans), [visibleWidgetIds, customSpans]);

  // ── Render any widget ──
  const renderWidget = (widgetId: string) => {
    const colClass = adaptiveColClasses[widgetId] || getColClass(widgetId);
    const def = widgetRegistry.get(widgetId);
    const label = def?.name || widgetId;
    const currentSpan = getWidgetSpan(widgetId, customSpans);

    // Check if it's a built-in section
    const isBuiltIn = builtInWidgets.some(w => w.id === widgetId);

    if (isBuiltIn) {
      const content = renderBuiltInWidget(widgetId);
      if (!content) return null;
      return (
        <DraggableDashboardSection
          key={widgetId}
          id={widgetId}
          isDraggable={canDrag}
          label={label}
          className={colClass}
          isEditMode={isEditMode}
          onRemove={() => handleRemoveWidget(widgetId)}
          currentSpan={currentSpan}
          onResize={(span) => handleResizeWidget(widgetId, span)}
        >
          {content}
        </DraggableDashboardSection>
      );
    }

    // Dynamic widget
    if (def) {
      return (
        <DraggableDashboardSection
          key={widgetId}
          id={widgetId}
          isDraggable={canDrag}
          label={label}
          className={colClass}
          isEditMode={isEditMode}
          onRemove={() => handleRemoveWidget(widgetId)}
          currentSpan={currentSpan}
          onResize={(span) => handleResizeWidget(widgetId, span)}
        >
          <DashboardWidget
            widget={def}
            onRemove={handleRemoveWidget}
            onMove={() => {}}
            metrics={metrics}
            isDraggable={canDrag}
            dateRange={dateRange ? { from: dateRange.from, to: dateRange.to } : { from: startDate, to: endDate }}
          />
        </DraggableDashboardSection>
      );
    }

    return null;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-3 md:p-6">
      {/* Header */}
      <div className="bg-white rounded-xl mb-4 md:mb-6 shadow-sm border border-gray-100">
        <div className="px-4 md:px-6 py-4 md:py-8">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 md:gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="p-2 md:p-3 bg-blue-50 rounded-xl shadow-sm">
                  <BarChart3 className="h-6 w-6 md:h-8 md:w-8 text-blue-600" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-xl md:text-3xl font-bold tracking-tight text-slate-800 truncate">Welcome to Dashboard</h1>
                  <p className="text-slate-600 text-sm md:text-lg truncate">Monitor your business performance</p>
                </div>
              </div>
              <div className="flex gap-2 md:gap-4 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap mt-2">
                <div className="bg-white border border-blue-200 text-slate-700 rounded-lg px-3 py-1.5 md:px-4 md:py-2 shadow-sm flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-blue-500" />
                    <span className="text-xs md:text-sm font-medium whitespace-nowrap">{format(new Date(), "MMM dd")}</span>
                  </div>
                </div>
                <div className="bg-white border border-green-200 rounded-lg px-3 py-1.5 md:px-4 md:py-2 shadow-sm flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-green-500" />
                    <span className="text-xs md:text-sm font-medium text-slate-700 whitespace-nowrap">System Active</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-start md:items-end gap-3 flex-shrink-0">
              <DateRangePicker
                dateRange={dateRange}
                onDateRangeChange={setDateRange}
                preset={datePreset}
                onPresetChange={setDatePreset}
                className="w-full md:w-auto md:min-w-[200px]"
              />
              <div className="flex items-center gap-2 overflow-x-auto overflow-y-visible pt-2 pb-1 -mx-4 px-4 md:mx-0 md:px-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsEditMode(!isEditMode);
                    if (!isEditMode) setIsRearrangeMode(true);
                    else setIsRearrangeMode(false);
                  }}
                  className={`flex-shrink-0 ${isEditMode ? 
                    "bg-amber-50 border border-amber-300 text-amber-700 hover:bg-amber-100 shadow-sm" : 
                    "bg-white border border-gray-200 text-slate-600 hover:bg-gray-50 shadow-sm"
                  }`}
                >
                  <Settings className="h-4 w-4 mr-1 md:mr-2" />
                  <span className="whitespace-nowrap">{isEditMode ? 'Done' : 'Customize'}</span>
                </Button>
                
                {isEditMode && (
                  <>
                    <AddWidgetDialog 
                      onAddWidget={handleAddWidget}
                      existingWidgets={activeWidgetIds}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleResetDashboard}
                      className="flex-shrink-0 bg-white border border-gray-200 text-slate-600 hover:bg-gray-50 shadow-sm"
                    >
                      <RotateCcw className="h-4 w-4 mr-1" />
                      <span className="hidden sm:inline">Reset</span>
                    </Button>
                  </>
                )}

                <ShiftReconciliationWidget />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleUniversalSync}
                  disabled={universalSyncing || syncMutation.isPending}
                  className="bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 shadow-sm flex-shrink-0"
                  title="Universal Sync"
                >
                  <CloudDownload className={`h-4 w-4 ${universalSyncing ? 'animate-pulse' : ''}`} />
                  <span className="hidden sm:inline ml-2">{universalSyncing ? 'Syncing...' : 'Terminal Sync'}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefreshDashboard}
                  disabled={isRefreshing}
                  className="bg-white border border-gray-200 text-slate-600 hover:bg-gray-50 shadow-sm flex-shrink-0"
                >
                  <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline ml-2">{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sync Indicator */}
      {universalSyncing && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-blue-50 border border-blue-200 text-xs text-blue-700 mb-4">
          <RefreshCw className="h-3 w-3 animate-spin" />
          Universal sync in progress — orders, purchases, sales, assets...
        </div>
      )}

      {/* Edit Mode Banner */}
      {isEditMode && (
        <div className="bg-amber-50 border-2 border-amber-300 text-amber-800 rounded-xl p-4 md:p-6 shadow-md mb-4">
          <div className="flex items-start md:items-center gap-3 md:gap-4">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-amber-600 rounded-xl flex items-center justify-center shadow-md flex-shrink-0">
              <Settings className="h-5 w-5 md:h-6 md:w-6 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base md:text-lg font-bold">🎨 Customize Mode Active</h3>
              <p className="text-amber-700 mt-1 text-sm md:text-base">
                Drag widgets to reorder • Hover & click ✕ to remove • Use "Add Widget" to add new ones
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setIsEditMode(false); setIsRearrangeMode(false); }}
              className="border-amber-400 text-amber-700 hover:bg-amber-100 flex-shrink-0"
            >
              Done
            </Button>
          </div>
        </div>
      )}

      {/* Widget Grid */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={visibleWidgetIds} strategy={rectSortingStrategy}>
          <div className={`grid grid-cols-12 gap-3 md:gap-6 auto-rows-auto items-stretch ${canDrag ? 'pl-4' : ''}`}>
            {visibleWidgetIds.map(id => renderWidget(id))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Empty state */}
      {visibleWidgetIds.length === 0 && (
        <div className="text-center py-20">
          <div className="w-20 h-20 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-6">
            <BarChart3 className="h-10 w-10 text-muted-foreground opacity-50" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">Dashboard is empty</h3>
          <p className="text-muted-foreground mb-6">Add widgets to customize your dashboard view</p>
          <AddWidgetDialog onAddWidget={handleAddWidget} existingWidgets={activeWidgetIds} />
        </div>
      )}
    </div>
  );
}
