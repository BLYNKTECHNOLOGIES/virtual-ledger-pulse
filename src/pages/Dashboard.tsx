import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowUpIcon, ArrowDownIcon, DollarSign, TrendingUp, Users, Wallet, Settings, RefreshCw, BarChart3, Activity, Package, GripVertical, CloudDownload, RotateCcw } from "lucide-react";
import { useSidebarEdit } from "@/contexts/SidebarEditContext";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, DragEndEvent, DragStartEvent, DragOverlay } from "@dnd-kit/core";
import { arrayMove, SortableContext, rectSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { DraggableDashboardSection } from "@/components/dashboard/DraggableDashboardSection";
import type { WidgetSize } from "@/components/dashboard/DraggableDashboardSection";
import { AddWidgetDialog, builtInWidgets, widgetRegistry } from "@/components/dashboard/AddWidgetDialog";
import type { WidgetType } from "@/components/dashboard/AddWidgetDialog";
import DashboardWidget from "@/components/dashboard/DashboardWidget";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { ShiftReconciliationWidget } from "@/components/dashboard/ShiftReconciliationWidget";
import { ActionRequiredWidget } from "@/components/dashboard/ActionRequiredWidget";
import { QuickLinksWidget } from "@/components/dashboard/QuickLinksWidget";
import { InteractiveHeatmap } from "@/components/dashboard/InteractiveHeatmap";
import { MyTasksWidget } from "@/components/dashboard/widgets/MyTasksWidget";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { openTransaction } from "@/components/transaction-detail";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { syncCompletedBuyOrders } from '@/hooks/useTerminalPurchaseSync';
import { syncCompletedSellOrders } from '@/hooks/useTerminalSalesSync';
// Small Buys/Sales sync intentionally NOT imported here — use dedicated buttons only.
import { syncSpotTradesFromBinance, syncSpotTradesToConversions } from '@/hooks/useSpotTradeSyncStandalone';
import { useSyncOrderHistory } from '@/hooks/useBinanceOrderSync';
import { toast as sonnerToast } from 'sonner';
import { DateRange } from "react-day-picker";
import { DateRangePicker, DateRangePreset, getDateRangeFromPreset } from "@/components/ui/date-range-picker";
import { ClickableCard, buildTransactionFilters } from "@/components/ui/clickable-card";
import { fetchActiveWalletsWithLedgerUsdtBalance } from "@/lib/wallet-ledger-balance";
import { isAdjustmentBank } from "@/lib/adjustment-accounts";

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
  const userDisplayName = useMemo(() => {
    if (!user) return "User";
    return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || user.email || "User";
  }, [user]);
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

  // Tracks whether the user's saved layout has been loaded from the database.
  // Persistence to the DB is gated on this so we never overwrite a remote layout
  // with the localStorage/default seed before it has been fetched.
  const dbLoadedRef = useRef(false);

  // Re-load local seed when the authenticated user changes (login, refresh).
  useEffect(() => {
    dbLoadedRef.current = false;
    setActiveWidgetIds(readWidgetIds(storageKey));
    setCustomSpans(readSpans(spansStorageKey));
  }, [storageKey, spansStorageKey, readWidgetIds, readSpans]);

  // ── Cross-device layout: source of truth is user_preferences.widget_settings ──
  const { data: dbLayout } = useQuery({
    queryKey: ['dashboard-layout', userId],
    queryFn: async () => {
      if (userId === 'default') return null;
      const { data } = await supabase
        .from('user_preferences')
        .select('widget_settings')
        .eq('user_id', userId)
        .maybeSingle();
      const settings = (data?.widget_settings as Record<string, unknown>) || {};
      return (settings.dashboard as { activeWidgets?: string[]; spans?: Record<string, number> }) ?? {};
    },
    enabled: userId !== 'default',
    staleTime: 60_000,
  });

  // Apply the remote layout once it arrives (overrides the local seed).
  useEffect(() => {
    if (!dbLayout) return;
    if (Array.isArray(dbLayout.activeWidgets) && dbLayout.activeWidgets.length > 0) {
      const seen = new Set<string>();
      const ids = dbLayout.activeWidgets.filter((id) => (seen.has(id) ? false : (seen.add(id), true)));
      setActiveWidgetIds(ids);
      if (storageKey) localStorage.setItem(storageKey, JSON.stringify(ids));
    }
    if (dbLayout.spans && typeof dbLayout.spans === 'object') {
      setCustomSpans(dbLayout.spans);
      if (spansStorageKey) localStorage.setItem(spansStorageKey, JSON.stringify(dbLayout.spans));
    }
    dbLoadedRef.current = true;
  }, [dbLayout, storageKey, spansStorageKey]);

  // Persist the current layout to user_preferences (per-user, cross-device).
  const persistLayoutToDb = useCallback(async (ids: string[], spans: Record<string, number>) => {
    if (userId === 'default') return;
    try {
      const { data: existing } = await supabase
        .from('user_preferences')
        .select('id, widget_settings')
        .eq('user_id', userId)
        .maybeSingle();
      const currentSettings = (existing?.widget_settings as Record<string, unknown>) || {};
      const newSettings = { ...currentSettings, dashboard: { activeWidgets: ids, spans } };
      if (existing) {
        await supabase
          .from('user_preferences')
          .update({ widget_settings: newSettings, updated_at: new Date().toISOString() })
          .eq('user_id', userId);
      } else {
        await supabase
          .from('user_preferences')
          .insert({ user_id: userId, widget_settings: newSettings });
      }
    } catch (err) {
      console.warn('Failed to persist dashboard layout:', err);
    }
  }, [userId]);

  const handleResizeWidget = useCallback((widgetId: string, span: WidgetSize) => {
    setCustomSpans(prev => {
      const next = { ...prev, [widgetId]: span };
      if (spansStorageKey) localStorage.setItem(spansStorageKey, JSON.stringify(next));
      persistLayoutToDb(activeWidgetIds, next);
      return next;
    });
  }, [spansStorageKey, persistLayoutToDb, activeWidgetIds]);

  // Persist active widgets whenever they change (localStorage + DB once loaded).
  useEffect(() => {
    if (storageKey) localStorage.setItem(storageKey, JSON.stringify(activeWidgetIds));
    if (dbLoadedRef.current) persistLayoutToDb(activeWidgetIds, customSpans);
  }, [activeWidgetIds, storageKey, persistLayoutToDb, customSpans]);


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
        salesData,
        purchaseData,
        prevSalesData,
        prevPurchaseData,
        { count: verifiedClientsCount },
        { count: totalClientsCount },
        bankData,
        productsData,
        walletAssetBalances,
      ] = await Promise.all([
        fetchAllPaginated<any>(() => supabase.from('sales_orders').select('total_amount, created_at')
          .gte('created_at', startOfDay(startDate).toISOString())
          .lte('created_at', endOfDay(endDate).toISOString())),
        fetchAllPaginated<any>(() => supabase.from('purchase_orders').select('total_amount, created_at')
          .gte('created_at', startOfDay(startDate).toISOString())
          .lte('created_at', endOfDay(endDate).toISOString())),
        fetchAllPaginated<any>(() => supabase.from('sales_orders').select('total_amount')
          .gte('created_at', prevStart.toISOString())
          .lte('created_at', prevEnd.toISOString())),
        fetchAllPaginated<any>(() => supabase.from('purchase_orders').select('total_amount')
          .gte('created_at', prevStart.toISOString())
          .lte('created_at', prevEnd.toISOString())),
        supabase.from('clients').select('id', { count: 'exact', head: true }).eq('kyc_status', 'VERIFIED'),
        supabase.from('clients').select('id', { count: 'exact', head: true }),
        fetchAllPaginated<any>(() => supabase.from('bank_accounts').select('account_name, balance, lien_amount').eq('status', 'ACTIVE').is('dormant_at', null)),
        fetchAllPaginated<any>(() => supabase.from('products').select('code, cost_price')),
        fetchAllPaginated<any>(() => supabase.from('wallet_asset_balances').select('asset_code, balance')),
      ]);


      const totalSalesOrders = salesData?.length || 0;
      const totalSales = salesData?.reduce((sum, o) => sum + Number(o.total_amount), 0) || 0;
      const totalPurchases = purchaseData?.length || 0;
      const totalSpending = purchaseData?.reduce((sum, o) => sum + Number(o.total_amount), 0) || 0;
      const verifiedClients = verifiedClientsCount || 0;
      const totalClients = totalClientsCount || 0;


      // Previous period metrics
      const prevTotalSalesOrders = prevSalesData?.length || 0;
      const prevTotalSales = prevSalesData?.reduce((sum, o) => sum + Number(o.total_amount), 0) || 0;

      // Growth rates
      const salesGrowth = prevTotalSales > 0 ? ((totalSales - prevTotalSales) / prevTotalSales) * 100 : (totalSales > 0 ? 100 : 0);
      const ordersGrowth = prevTotalSalesOrders > 0 ? ((totalSalesOrders - prevTotalSalesOrders) / prevTotalSalesOrders) * 100 : (totalSalesOrders > 0 ? 100 : 0);

      const bankBalance = bankData
        ?.filter(a => !isAdjustmentBank((a as any).account_name))
        .reduce((sum, a) => sum + (Number(a.balance) - Number(a.lien_amount || 0)), 0) || 0;

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
  // Pointer for mouse/touch, keyboard sensor so reordering is possible without a pointer.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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
      // NOTE: Small Buys / Small Sales are intentionally EXCLUDED from Universal Sync.
      // They must only be generated via the dedicated "Sync Small …" buttons so operators
      // do not get unexpected SM- batches every time they hit Universal Sync.
      const [orderResult, purchaseResult, salesResult, assetResult, spotTradeResult, spotConvResult] = await Promise.allSettled([
        new Promise<string>((resolve, reject) => {
          syncMutation.mutate({ fullSync: false }, {
            onSuccess: () => resolve('Orders synced'),
            onError: (err: any) => reject(err?.message || 'Order sync failed'),
          });
        }),
        syncCompletedBuyOrders().then(r => `Purchases: ${r.synced} synced, ${r.duplicates} skipped`),
        syncCompletedSellOrders().then(r => `Sales: ${r.synced} synced, ${r.duplicates} skipped`),
        supabase.functions.invoke('binance-assets', { body: { action: 'syncAssetMovements', force: false } }).then(() => 'Asset movements synced'),
        syncSpotTradesFromBinance().then(r => `Spot Trades: ${r.synced} synced`),
        syncSpotTradesToConversions().then(r => `Spot Conversions: ${r.inserted} created`).catch(() => 'Spot Conversions: skipped'),
      ]);
      for (const r of [orderResult, purchaseResult, salesResult, assetResult, spotTradeResult, spotConvResult]) {
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
            <StatCard
              label="Total Sales"
              icon={DollarSign}
              value={`₹${Math.round(metrics?.totalSales || 0).toLocaleString('en-IN')}`}
              deltaPercent={metrics?.salesGrowth ?? 0}
            />
          </ClickableCard>
        );

      case 'metric-sales-orders':
        return (
          <ClickableCard to="/sales" searchParams={buildTransactionFilters({ dateFrom: startDate, dateTo: endDate })}>
            <StatCard
              label="Sales Orders"
              icon={TrendingUp}
              value={(metrics?.totalSalesOrders || 0).toLocaleString('en-IN')}
              deltaPercent={metrics?.ordersGrowth ?? 0}
            />
          </ClickableCard>
        );

      case 'metric-total-clients':
        return (
          <ClickableCard to="/clients">
            <StatCard
              label="Total Clients"
              icon={Users}
              value={(metrics?.totalClients || 0).toLocaleString('en-IN')}
              helper={`Verified: ${metrics?.verifiedClients || 0}`}
            />
          </ClickableCard>
        );

      case 'metric-total-cash':
        return (
          <ClickableCard to="/bams">
            <StatCard
              label="Total Cash"
              icon={Wallet}
              value={`₹${Math.round(metrics?.totalCash || 0).toLocaleString('en-IN')}`}
              helper="Banks + Stock"
            />
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
          <Card className="h-full flex flex-col">
            <CardHeader className="border-b border-border py-3 px-4">
              <SectionHeader title="Recent Activity" icon={Activity} />
            </CardHeader>
            <CardContent className="p-2 overflow-y-auto max-h-[500px]">
              <div className="divide-y divide-border/70">
                {recentActivity?.slice(0, 8).map((activity) => (
                  <div
                    key={activity.id}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('button, a, input, [role="button"], [data-no-row-click]')) return;
                      openTransaction({ type: activity.type === 'sale' ? 'sales_order' : 'purchase_order', id: activity.id });
                    }}
                    className="flex items-center justify-between gap-3 px-2 py-2.5 rounded-lg cursor-pointer transition-colors duration-150 hover:bg-muted/50 motion-reduce:transition-none"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                        {activity.type === 'sale'
                          ? <ArrowUpIcon className="h-4 w-4 text-success" />
                          : <ArrowDownIcon className="h-4 w-4 text-muted-foreground" />}
                      </span>
                      <div className="min-w-0">
                        <p className="t-card-title text-foreground truncate">{activity.title}</p>
                        <p className="t-secondary">{format(new Date(activity.timestamp), "MMM dd, HH:mm")}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-[13px] font-semibold tabular-nums ${activity.type === 'sale' ? 'text-success' : 'text-foreground'}`}>
                        {activity.type === 'sale' ? '+' : '-'}₹{Number(activity.amount).toLocaleString('en-IN')}
                      </p>
                      <p className="t-secondary">{activity.reference}</p>
                    </div>
                  </div>
                ))}
              </div>
              {(!recentActivity || recentActivity.length === 0) && (
                <EmptyState icon={Activity} title="No activity in selected period" className="py-10" />
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
    <div className="page-shell min-h-screen bg-background">
      {/* Header */}
      <PageHeader
        title={<span className="t-page-title">Welcome, {userDisplayName}</span>}
        description="Monitor your business performance"
        actions={
          <div className="flex flex-col items-start md:items-end gap-2 flex-shrink-0">
            <DateRangePicker
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              preset={datePreset}
              onPresetChange={setDatePreset}
              className="w-full md:w-auto md:min-w-[200px]"
            />
            <div className="flex items-center gap-2 overflow-x-auto overflow-y-visible pb-1">
              <Button
                variant={isEditMode ? "secondary" : "outline"}
                size="sm"
                onClick={() => {
                  setIsEditMode(!isEditMode);
                  if (!isEditMode) setIsRearrangeMode(true);
                  else setIsRearrangeMode(false);
                }}
                className="flex-shrink-0"
              >
                <Settings className="h-4 w-4" />
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
                    className="flex-shrink-0"
                  >
                    <RotateCcw className="h-4 w-4" />
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
                loading={universalSyncing}
                className="flex-shrink-0"
                title="Universal Sync"
              >
                {!universalSyncing && <CloudDownload className="h-4 w-4" />}
                <span className="hidden sm:inline">{universalSyncing ? 'Syncing...' : 'Terminal Sync'}</span>
              </Button>
            </div>
          </div>
        }
      />

      {/* Sync Indicator */}
      {universalSyncing && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-info/10 border border-info/20 text-xs text-info">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          Universal sync in progress — orders, purchases, sales, assets...
        </div>
      )}

      {/* Edit Mode Banner */}
      {isEditMode && (
        <div className="rounded-xl border border-warning/40 bg-warning/10 p-4">
          <div className="flex items-start md:items-center gap-3">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warning/20 text-warning">
              <Settings className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="t-card-title text-foreground">Customize mode active</h3>
              <p className="t-secondary mt-0.5">
                Drag widgets to reorder • Hover & click ✕ to remove • Use "Add Widget" to add new ones
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setIsEditMode(false); setIsRearrangeMode(false); }}
              className="flex-shrink-0"
            >
              Done
            </Button>
          </div>
        </div>
      )}

      {/* Widget Grid */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={visibleWidgetIds} strategy={rectSortingStrategy}>
          <div className={`grid grid-cols-12 gap-3 md:gap-4 auto-rows-auto items-stretch stagger-children ${canDrag ? 'pl-4' : ''}`}>
            {visibleWidgetIds.map(id => renderWidget(id))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Empty state */}
      {visibleWidgetIds.length === 0 && (
        <EmptyState
          icon={BarChart3}
          title="Dashboard is empty"
          description="Add widgets to customize your dashboard view"
          action={<AddWidgetDialog onAddWidget={handleAddWidget} existingWidgets={activeWidgetIds} />}
          className="py-16"
        />
      )}
    </div>
  );
}
