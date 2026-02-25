import { useState, useEffect, useCallback, ReactNode, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowUpIcon, ArrowDownIcon, DollarSign, TrendingUp, Users, Wallet, Settings, RefreshCw, BarChart3, Activity, Zap, Target, Award, Calendar, Package, Building, GripVertical, CloudDownload } from "lucide-react";
import { useSidebarEdit } from "@/contexts/SidebarEditContext";
import { useAuth } from "@/hooks/useAuth";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import { DraggableDashboardSection } from "@/components/dashboard/DraggableDashboardSection";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { ExchangeChart } from "@/components/dashboard/ExchangeChart";
import { AddWidgetDialog } from "@/components/dashboard/AddWidgetDialog";
import DashboardWidget from "@/components/dashboard/DashboardWidget";
import { ActionRequiredWidget } from "@/components/dashboard/ActionRequiredWidget";
import { QuickLinksWidget } from "@/components/dashboard/QuickLinksWidget";
import { InteractiveHeatmap } from "@/components/dashboard/InteractiveHeatmap";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, startOfDay, endOfDay, startOfMonth, endOfMonth } from "date-fns";
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

interface Widget {
  id: string;
  name: string;
  description: string;
  icon: any;
  category: string;
  size: 'small' | 'medium' | 'large';
}

export default function Dashboard() {
  const { user } = useAuth();
  const userId = user?.id || 'default';
  const [datePreset, setDatePreset] = useState<DateRangePreset>("last7days");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(getDateRangeFromPreset("last7days"));
  const [dashboardWidgets, setDashboardWidgets] = useState<Widget[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const { isDashboardRearrangeMode: isRearrangeMode, setIsDashboardRearrangeMode: setIsRearrangeMode } = useSidebarEdit();
  const { toast } = useToast();

  // Per-user localStorage keys
  const storageKeys = useMemo(() => ({
    itemOrder: `dashboardItemOrder_${userId}`,
    widgets: `dashboardWidgets_${userId}`,
  }), [userId]);

  // Flat item order for free-form dashboard rearrangement
  const defaultItemOrder = [
    'metric-total-sales', 'metric-sales-orders', 'metric-total-clients', 'metric-total-cash',
    'action-required', 'quick-links',
    'heatmap', 'recent-activity',
    'stock-inventory',
  ];
  
  const [itemOrder, setItemOrder] = useState<string[]>(() => {
    const saved = localStorage.getItem(`dashboardItemOrder_${userId}`);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Merge any new default items not in saved order
      const merged = [...parsed];
      defaultItemOrder.forEach(id => {
        if (!merged.includes(id)) merged.push(id);
      });
      return merged;
    }
    return defaultItemOrder;
  });

  // Item size config: how many columns each item spans in a 12-col grid
  const itemSpanConfig: Record<string, number> = {
    'metric-total-sales': 3,
    'metric-sales-orders': 3,
    'metric-total-clients': 3,
    'metric-total-cash': 3,
    'action-required': 12,
    'quick-links': 12,
    'heatmap': 8,
    'recent-activity': 4,
    'stock-inventory': 12,
  };

  // Default widgets with better selection
  const defaultWidgets = [
    {
      id: 'total-revenue',
      name: 'Total Revenue',
      description: 'Revenue overview',
      icon: DollarSign,
      category: 'Metrics',
      size: 'small' as const
    },
    {
      id: 'total-clients',
      name: 'Total Clients',
      description: 'Client overview',
      icon: Users,
      category: 'Metrics',
      size: 'small' as const
    }
  ];

  // Load saved dashboard layout
  useEffect(() => {
    const savedWidgets = localStorage.getItem(storageKeys.widgets);
    if (savedWidgets) {
      setDashboardWidgets(JSON.parse(savedWidgets));
    } else {
      setDashboardWidgets(defaultWidgets);
    }
  }, [storageKeys.widgets]);

  // Reload item order when user changes
  useEffect(() => {
    const saved = localStorage.getItem(storageKeys.itemOrder);
    if (saved) {
      const parsed = JSON.parse(saved);
      const merged = [...parsed];
      defaultItemOrder.forEach(id => {
        if (!merged.includes(id)) merged.push(id);
      });
      setItemOrder(merged);
    } else {
      setItemOrder(defaultItemOrder);
    }
  }, [storageKeys.itemOrder]);

  // Save item order
  useEffect(() => {
    localStorage.setItem(storageKeys.itemOrder, JSON.stringify(itemOrder));
  }, [itemOrder, storageKeys.itemOrder]);

  // Save dashboard layout
  useEffect(() => {
    if (dashboardWidgets.length > 0) {
      localStorage.setItem(storageKeys.widgets, JSON.stringify(dashboardWidgets));
    }
  }, [dashboardWidgets, storageKeys.widgets]);

  // Calculate date range based on selected range
  const getDateRangeValues = () => {
    if (dateRange?.from && dateRange?.to) {
      return { start: dateRange.from, end: dateRange.to };
    }
    // Fallback to last 7 days
    const now = new Date();
    return { start: subDays(now, 7), end: now };
  };

  const { start: startDate, end: endDate } = getDateRangeValues();

  // Fetch dashboard metrics with period filtering
  const { data: metrics, refetch: refetchMetrics } = useQuery({
    queryKey: ['dashboard_metrics', dateRange?.from?.toISOString(), dateRange?.to?.toISOString()],
    queryFn: async () => {
      // ERP balances are source of truth - no auto-sync from Binance
      
      // Get sales orders within date range
      const { data: salesData } = await supabase
        .from('sales_orders')
        .select('total_amount, created_at')
        .gte('created_at', startOfDay(startDate).toISOString())
        .lte('created_at', endOfDay(endDate).toISOString());

      // Get purchase orders within date range
      const { data: purchaseData } = await supabase
        .from('purchase_orders')
        .select('total_amount, created_at')
        .gte('created_at', startOfDay(startDate).toISOString())
        .lte('created_at', endOfDay(endDate).toISOString());

      // Get verified clients only
      const { data: clientsData } = await supabase
        .from('clients')
        .select('id')
        .eq('kyc_status', 'VERIFIED');

      // Get total clients count
      const { data: totalClientsData } = await supabase
        .from('clients')
        .select('id');

      // Get active bank accounts and their available balances (total balance - lien amount)
      // Exclude dormant banks from calculations
      const { data: bankData } = await supabase
        .from('bank_accounts')
        .select('balance, lien_amount')
        .eq('status', 'ACTIVE')
        .is('dormant_at', null); // Exclude dormant accounts

      // Get products for cost_price lookup (INR rate per unit)
      const { data: productsData } = await supabase
        .from('products')
        .select('code, cost_price');

      // Get actual live wallet asset balances (source of truth for crypto stock)
      const { data: walletAssetBalances } = await supabase
        .from('wallet_asset_balances')
        .select('asset_code, balance');

      const totalSalesOrders = salesData?.length || 0;
      const totalSales = salesData?.reduce((sum, order) => sum + Number(order.total_amount), 0) || 0;
      const totalPurchases = purchaseData?.length || 0;
      const totalSpending = purchaseData?.reduce((sum, order) => sum + Number(order.total_amount), 0) || 0;
      const verifiedClients = clientsData?.length || 0;
      const totalClients = totalClientsData?.length || 0;
      
      // Calculate total cash (sum of available bank balances + stock value)
      // Available Balance = Total Balance - Lien Amount
      const bankBalance = bankData?.reduce((sum, account) => {
        const availableBalance = Number(account.balance) - Number(account.lien_amount || 0);
        return sum + availableBalance;
      }, 0) || 0;

      // Build cost price map from products (INR rate per unit)
      const costPriceMap: Record<string, number> = {};
      productsData?.forEach(p => {
        if (p.code) costPriceMap[p.code] = Number(p.cost_price || 0);
      });

      // Aggregate actual balances per asset from wallet_asset_balances (source of truth)
      const assetTotals: Record<string, number> = {};
      walletAssetBalances?.forEach(ab => {
        const code = ab.asset_code;
        assetTotals[code] = (assetTotals[code] || 0) + Number(ab.balance || 0);
      });

      // Stock value = sum of (live wallet balance × INR cost price per unit)
      const stockValue = Object.entries(assetTotals).reduce((sum, [code, balance]) => {
        const inrRate = costPriceMap[code] || 0;
        return sum + (balance * inrRate);
      }, 0);

      const totalCash = bankBalance + stockValue;

      return {
        totalSalesOrders,
        totalSales,
        totalPurchases,
        totalSpending,
        verifiedClients,
        totalClients,
        totalCash,
        bankBalance,
        stockValue,
        totalRevenue: totalSales // Use actual sales data for revenue
      };
    },
  });

  // Fetch asset inventory data with live updates (consistent with Stock Management)
  const { data: warehouseStock, refetch: refetchWarehouseStock } = useQuery({
    queryKey: ['dashboard_asset_inventory'],
    queryFn: async () => {
      // ERP balances are source of truth - no auto-sync from Binance

      const { data: wallets, error: walletsError } = await supabase
        .from('wallets')
        .select('*')
        .eq('is_active', true)
        .order('wallet_name');

      if (walletsError) {
        console.error('Error fetching wallets:', walletsError);
      }

      // Build asset inventory directly from wallets
      const assetMap = new Map();
      
      // Always calculate USDT from wallets
      let totalWalletStock = 0;
      const walletDistribution: any[] = [];
      
      wallets?.forEach(wallet => {
        const balance = Number(wallet.current_balance) || 0;
        totalWalletStock += balance;
        
        walletDistribution.push({
          name: wallet.wallet_name,
          quantity: balance,
          percentage: 0
        });
      });
      
      // Calculate percentages
      walletDistribution.forEach(dist => {
        dist.percentage = totalWalletStock > 0 ? (dist.quantity / totalWalletStock) * 100 : 0;
      });
      
      // Add USDT asset from wallets
      if (wallets && wallets.length > 0) {
        assetMap.set('USDT', {
          id: 'USDT',
          name: 'USDT',
          code: 'USDT',
          total_stock: totalWalletStock,
          wallet_distribution: walletDistribution.filter(d => d.quantity > 0),
          unit: 'Units'
        });
      }

      // Return all assets from the map
      const assets = Array.from(assetMap.values());
      return assets;
    },
    refetchInterval: 10000,
    staleTime: 0,
    gcTime: 0,
  });

  // Fetch recent transactions for activity feed with period filtering
  const { data: recentActivity, refetch: refetchActivity } = useQuery({
    queryKey: ['recent_activity', dateRange?.from?.toISOString(), dateRange?.to?.toISOString()],
    queryFn: async () => {
      // Get recent sales orders within period
      const { data: salesOrders } = await supabase
        .from('sales_orders')
        .select('id, order_number, client_name, total_amount, created_at')
        .gte('created_at', startOfDay(startDate).toISOString())
        .lte('created_at', endOfDay(endDate).toISOString())
        .order('created_at', { ascending: false })
        .limit(5);

      // Get recent purchase orders within period
      const { data: purchaseOrders } = await supabase
        .from('purchase_orders')
        .select('id, order_number, supplier_name, total_amount, created_at')
        .gte('created_at', startOfDay(startDate).toISOString())
        .lte('created_at', endOfDay(endDate).toISOString())
        .order('created_at', { ascending: false })
        .limit(5);

      // Combine and sort by date
      const allActivity = [
        ...(salesOrders || []).map(order => ({
          id: order.id,
          type: 'sale',
          title: `Sale to ${order.client_name}`,
          amount: order.total_amount,
          reference: order.order_number,
          timestamp: order.created_at
        })),
        ...(purchaseOrders || []).map(order => ({
          id: order.id,
          type: 'purchase',
          title: `Purchase from ${order.supplier_name}`,
          amount: order.total_amount,
          reference: order.order_number,
          timestamp: order.created_at
        }))
      ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
       .slice(0, 10);

      return allActivity;
    },
  });

  const handleAddWidget = (widget: Widget) => {
    setDashboardWidgets(prev => [...prev, widget]);
    toast({
      title: "Widget Added Successfully! 🎉",
      description: `${widget.name} has been added to your dashboard.`,
    });
  };

  const handleRemoveWidget = (widgetId: string) => {
    setDashboardWidgets(prev => prev.filter(w => w.id !== widgetId));
    toast({
      title: "Widget Removed",
      description: "Widget has been removed from your dashboard.",
    });
  };

  const handleMoveWidget = (widgetId: string, direction: 'up' | 'down') => {
    setDashboardWidgets(prev => {
      const currentIndex = prev.findIndex(w => w.id === widgetId);
      if (currentIndex === -1) return prev;
      
      const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      if (newIndex < 0 || newIndex >= prev.length) return prev;
      
      const newWidgets = [...prev];
      [newWidgets[currentIndex], newWidgets[newIndex]] = [newWidgets[newIndex], newWidgets[currentIndex]];
      return newWidgets;
    });
  };

  const handleResetDashboard = () => {
    setDashboardWidgets(defaultWidgets);
    setItemOrder(defaultItemOrder);
    localStorage.removeItem(storageKeys.widgets);
    localStorage.removeItem(storageKeys.itemOrder);
    toast({
      title: "Dashboard Reset",
      description: "Dashboard has been reset to default layout.",
    });
  };

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // Unified drag handler for all items
  const handleItemDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setItemOrder(prev => {
        // Build full order including widget items
        const full = [...prev];
        dashboardWidgets.forEach(w => {
          const wId = `widget-${w.id}`;
          if (!full.includes(wId)) full.push(wId);
        });
        const oldIndex = full.indexOf(active.id as string);
        const newIndex = full.indexOf(over.id as string);
        if (oldIndex === -1 || newIndex === -1) return prev;
        return arrayMove(full, oldIndex, newIndex);
      });
    }
  };

  // Widget-only drag handler (for dynamic widgets within their group)
  const handleWidgetDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setDashboardWidgets(prev => {
        const oldIndex = prev.findIndex(w => w.id === active.id);
        const newIndex = prev.findIndex(w => w.id === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  };

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [universalSyncing, setUniversalSyncing] = useState(false);
  const syncMutation = useSyncOrderHistory();

  const handleRefreshDashboard = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refetchMetrics(),
        refetchWarehouseStock(),
        refetchActivity()
      ]);
      toast({
        title: "Dashboard Refreshed",
        description: "All dashboard data has been refreshed.",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleUniversalSync = useCallback(async () => {
    setUniversalSyncing(true);
    sonnerToast.info('Universal sync started — syncing orders, purchases, sales, assets...');

    const results: string[] = [];
    const errors: string[] = [];

    try {
      const [orderResult, purchaseResult, salesResult, smallSalesResult, smallBuysResult, assetResult, spotTradeResult, spotConvResult] = await Promise.allSettled([
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
        syncSmallSales().then(r => `Small Sales: ${r.synced} synced`).catch(() => 'Small Sales: skipped (not configured)'),
        syncSmallBuys().then(r => `Small Buys: ${r.synced} synced`).catch(() => 'Small Buys: skipped (not configured)'),
        supabase.functions.invoke('binance-assets', {
          body: { action: 'syncAssetMovements', force: false },
        }).then(() => 'Asset movements synced'),
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
        sonnerToast.warning(`Sync partially complete (${errors.length} errors)`, {
          description: [...results, ...errors.map(e => `❌ ${e}`)].join(' · '),
        });
      }
    } catch (err: any) {
      sonnerToast.error('Universal sync failed', { description: err.message });
    } finally {
      setUniversalSyncing(false);
      refetchMetrics();
      refetchWarehouseStock();
      refetchActivity();
    }
  }, [syncMutation, refetchMetrics, refetchWarehouseStock, refetchActivity]);

  return (
    <div className="min-h-screen bg-gray-50 p-3 md:p-6">
      {/* Clean White Header */}
      <div className="bg-white rounded-xl mb-4 md:mb-6 shadow-sm border border-gray-100">
        <div className="px-4 md:px-6 py-4 md:py-8">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 md:gap-6">
            {/* Left Side - Title and Quick Stats */}
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="p-2 md:p-3 bg-blue-50 rounded-xl shadow-sm">
                  <BarChart3 className="h-6 w-6 md:h-8 md:w-8 text-blue-600" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-xl md:text-3xl font-bold tracking-tight text-slate-800 truncate">
                    Welcome to Dashboard
                  </h1>
                  <p className="text-slate-600 text-sm md:text-lg truncate">
                    Monitor your business performance
                  </p>
                </div>
              </div>
              
              {/* Quick Stats in Header - scrollable on mobile */}
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
            
            {/* Right Side - Date Picker and Controls stacked */}
            <div className="flex flex-col items-start md:items-end gap-3 flex-shrink-0">
              {/* Date Range Picker */}
              <DateRangePicker
                dateRange={dateRange}
                onDateRangeChange={setDateRange}
                preset={datePreset}
                onPresetChange={setDatePreset}
                className="w-full md:w-auto md:min-w-[200px]"
              />
              
              {/* Dashboard Controls - below date picker */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditMode(!isEditMode)}
                  className={`flex-shrink-0 ${isEditMode ? 
                    "bg-amber-50 border border-amber-300 text-amber-700 hover:bg-amber-100 shadow-sm" : 
                    "bg-white border border-gray-200 text-slate-600 hover:bg-gray-50 shadow-sm"
                  }`}
                >
                  <Settings className="h-4 w-4 mr-1 md:mr-2" />
                  <span className="whitespace-nowrap">{isEditMode ? 'Exit' : 'Edit'}</span>
                </Button>
                
                <AddWidgetDialog 
                  onAddWidget={handleAddWidget}
                  existingWidgets={dashboardWidgets.map(w => w.id)}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleUniversalSync}
                  disabled={universalSyncing || syncMutation.isPending}
                  className="bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 shadow-sm flex-shrink-0"
                  title="Universal Sync — orders, purchases, sales, assets from Binance"
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

      {/* Universal Sync Indicator */}
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
            <div className="min-w-0">
              <h3 className="text-base md:text-lg font-bold">🎨 Edit Mode Active</h3>
              <p className="text-amber-700 mt-1 text-sm md:text-base">
                Customize your dashboard by moving or removing widgets.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Rearrange Mode Banner */}
      {isRearrangeMode && (
        <div className="bg-blue-50 border-2 border-blue-300 text-blue-800 rounded-xl p-4 md:p-6 shadow-md mb-4">
          <div className="flex items-start md:items-center gap-3 md:gap-4">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-blue-600 rounded-xl flex items-center justify-center shadow-md flex-shrink-0">
              <GripVertical className="h-5 w-5 md:h-6 md:w-6 text-white" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base md:text-lg font-bold">🔀 Rearrange Mode Active</h3>
              <p className="text-blue-700 mt-1 text-sm md:text-base">
                Drag the blue handles to freely reorder any widget anywhere on the dashboard.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* All items in a single flat DnD context */}
      {(() => {
        // Compute full item list including dynamic widgets
        const allDraggableIds = [
          ...itemOrder,
          ...dashboardWidgets.map(w => `widget-${w.id}`).filter(id => !itemOrder.includes(id)),
        ];

        // Add dynamic widget IDs to itemOrder if not present
        const fullOrder = [...itemOrder];
        dashboardWidgets.forEach(w => {
          const wId = `widget-${w.id}`;
          if (!fullOrder.includes(wId)) fullOrder.push(wId);
        });

        const renderItem = (itemId: string) => {
          // Get column span for CSS grid
          const span = itemSpanConfig[itemId] || (itemId.startsWith('widget-') ? 3 : 12);
          const colClass = span === 3 ? 'col-span-6 lg:col-span-3' : span === 4 ? 'col-span-12 lg:col-span-4' : span === 8 ? 'col-span-12 lg:col-span-8' : 'col-span-12';

          switch (itemId) {
            case 'metric-total-sales':
              return (
                <DraggableDashboardSection key={itemId} id={itemId} isDraggable={isRearrangeMode} label="Total Sales" className={colClass}>
                  <ClickableCard to="/sales" searchParams={buildTransactionFilters({ dateFrom: startDate, dateTo: endDate })}>
                    <Card className="bg-white border-2 border-blue-100 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 h-full">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="text-slate-600 text-sm font-medium">Total Sales</p>
                            <div className="text-xl xl:text-2xl font-bold mt-2 leading-tight break-words text-slate-800">
                              ₹{(metrics?.totalSales || 0).toLocaleString()}
                            </div>
                            <div className="flex items-center gap-1 mt-2">
                              <ArrowUpIcon className="h-4 w-4 text-green-500" />
                              <span className="text-sm font-medium text-slate-500">Selected Period</span>
                            </div>
                          </div>
                          <div className="bg-green-50 p-3 rounded-xl shadow-sm flex-shrink-0">
                            <DollarSign className="h-8 w-8 text-metric-sales-icon" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </ClickableCard>
                </DraggableDashboardSection>
              );

            case 'metric-sales-orders':
              return (
                <DraggableDashboardSection key={itemId} id={itemId} isDraggable={isRearrangeMode} label="Sales Orders" className={colClass}>
                  <ClickableCard to="/sales" searchParams={buildTransactionFilters({ dateFrom: startDate, dateTo: endDate })}>
                    <Card className="bg-white border-2 border-blue-100 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 h-full">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="text-slate-600 text-sm font-medium">Sales Orders</p>
                            <p className="text-2xl xl:text-3xl font-bold mt-2 truncate text-slate-800">{metrics?.totalSalesOrders || 0}</p>
                            <div className="flex items-center gap-1 mt-2">
                              <ArrowUpIcon className="h-4 w-4 text-purple-500" />
                              <span className="text-sm font-medium text-slate-500">Selected Period</span>
                            </div>
                          </div>
                          <div className="bg-purple-50 p-3 rounded-xl shadow-sm flex-shrink-0">
                            <TrendingUp className="h-8 w-8 text-metric-orders-icon" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </ClickableCard>
                </DraggableDashboardSection>
              );

            case 'metric-total-clients':
              return (
                <DraggableDashboardSection key={itemId} id={itemId} isDraggable={isRearrangeMode} label="Total Clients" className={colClass}>
                  <ClickableCard to="/clients">
                    <Card className="bg-white border-2 border-blue-100 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 h-full">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="text-slate-600 text-sm font-medium">Total Clients</p>
                            <div className="text-xl xl:text-2xl font-bold mt-2 leading-tight break-words text-slate-800">
                              {metrics?.totalClients || 0}
                            </div>
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
                </DraggableDashboardSection>
              );

            case 'metric-total-cash':
              return (
                <DraggableDashboardSection key={itemId} id={itemId} isDraggable={isRearrangeMode} label="Total Cash" className={colClass}>
                  <ClickableCard to="/bams">
                    <Card className="bg-white border-2 border-blue-100 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 h-full">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0 relative z-10">
                            <p className="text-slate-600 text-sm font-medium">Total Cash</p>
                            <div className="text-xl xl:text-2xl font-bold mt-2 leading-tight break-words text-slate-800">
                              ₹{(metrics?.totalCash || 0).toLocaleString()}
                            </div>
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
                </DraggableDashboardSection>
              );

            case 'action-required':
              return (
                <DraggableDashboardSection key={itemId} id={itemId} isDraggable={isRearrangeMode} label="Action Required" className={colClass}>
                  <ActionRequiredWidget />
                </DraggableDashboardSection>
              );

            case 'quick-links':
              return (
                <DraggableDashboardSection key={itemId} id={itemId} isDraggable={isRearrangeMode} label="Quick Links" className={colClass}>
                  <QuickLinksWidget onRemove={handleRemoveWidget} />
                </DraggableDashboardSection>
              );

            case 'heatmap':
              return (
                <DraggableDashboardSection key={itemId} id={itemId} isDraggable={isRearrangeMode} label="Heatmap" className={colClass}>
                  <InteractiveHeatmap selectedPeriod={datePreset} />
                </DraggableDashboardSection>
              );

            case 'recent-activity':
              return (
                <DraggableDashboardSection key={itemId} id={itemId} isDraggable={isRearrangeMode} label="Recent Activity" className={colClass}>
                  <Card className="bg-card border-2 border-border shadow-xl h-full">
                    <CardHeader className="bg-teal-600 text-white rounded-t-lg">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <div className="p-2 bg-teal-700 rounded-lg shadow-md">
                          <Activity className="h-5 w-5" />
                        </div>
                        Recent Activity
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 space-y-4 overflow-y-auto max-h-[500px]">
                      {recentActivity?.slice(0, 8).map((activity) => (
                        <div key={activity.id} className="flex items-center justify-between p-4 bg-card rounded-xl shadow-sm border-2 border-border hover:shadow-md transition-all duration-200">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${activity.type === 'sale' ? 'bg-emerald-100' : 'bg-muted'}`}>
                              {activity.type === 'sale' ? (
                                <ArrowUpIcon className="h-4 w-4 text-emerald-600" />
                              ) : (
                                <ArrowDownIcon className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                            <div>
                              <p className="font-semibold text-sm text-foreground">{activity.title}</p>
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(activity.timestamp), "MMM dd, HH:mm")}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={`font-bold text-sm ${activity.type === 'sale' ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                              {activity.type === 'sale' ? '+' : '-'}₹{Number(activity.amount).toLocaleString()}
                            </p>
                            <p className="text-xs text-muted-foreground">{activity.reference}</p>
                          </div>
                        </div>
                      ))}
                      {(!recentActivity || recentActivity.length === 0) && (
                        <div className="text-center py-12 text-muted-foreground">
                          <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
                            <Activity className="h-8 w-8 opacity-50" />
                          </div>
                          <p className="font-medium">No activity in selected period</p>
                          <p className="text-sm">Activity will appear here for the selected period</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </DraggableDashboardSection>
              );

            case 'stock-inventory':
              return (
                <DraggableDashboardSection key={itemId} id={itemId} isDraggable={isRearrangeMode} label="Asset Inventory" className={colClass}>
                  <ClickableCard to="/stock-management" searchParams={{ tab: 'quickview' }}>
                    <Card className="bg-card border-2 border-border shadow-xl">
                      <CardHeader className="bg-emerald-600 text-white rounded-t-lg">
                        <CardTitle className="flex items-center gap-3 text-xl">
                          <div className="p-2 bg-emerald-700 rounded-lg shadow-md">
                            <Package className="h-6 w-6" />
                          </div>
                          Asset Inventory
                          <span className="ml-auto text-sm opacity-75">Click to view details →</span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          {warehouseStock?.map((asset, index) => (
                            <Card key={asset.id || index} className="border-2 border-border hover:shadow-lg transition-all duration-300">
                              <CardHeader className="bg-secondary border-b">
                                <div className="flex items-center justify-between">
                                  <CardTitle className="flex items-center gap-2 text-lg">
                                    <Package className="h-5 w-5 text-muted-foreground" />
                                    {asset.name} ({asset.code})
                                  </CardTitle>
                                  <Badge className="bg-muted text-foreground">
                                    {asset.total_stock} {asset.unit}
                                  </Badge>
                                </div>
                              </CardHeader>
                              <CardContent className="p-6">
                                <div className="space-y-4">
                                  <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-muted-foreground">Total Holdings</span>
                                    <span className="text-lg font-bold">{asset.total_stock.toLocaleString()} {asset.unit}</span>
                                  </div>
                                  {asset.wallet_distribution && asset.wallet_distribution.length > 0 && (
                                    <div className="space-y-2">
                                      <span className="text-sm font-medium text-muted-foreground">Portfolio Distribution</span>
                                      {asset.wallet_distribution.slice(0, 3).map((dist: any, idx: number) => (
                                        <div key={idx} className="flex items-center justify-between text-sm">
                                          <span className="text-muted-foreground">{dist.name}</span>
                                          <div className="flex items-center gap-2">
                                            <span className="font-medium">{dist.quantity.toLocaleString()}</span>
                                            <span className="text-xs text-muted-foreground">({dist.percentage.toFixed(1)}%)</span>
                                          </div>
                                        </div>
                                      ))}
                                      {asset.wallet_distribution.length > 3 && (
                                        <div className="text-xs text-muted-foreground text-center">
                                          +{asset.wallet_distribution.length - 3} more wallets
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                          {(!warehouseStock || warehouseStock.length === 0) && (
                            <div className="col-span-full text-center py-12 text-muted-foreground">
                              <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <Package className="h-8 w-8 opacity-50" />
                              </div>
                              <p className="font-medium">No asset data available</p>
                              <p className="text-sm">Asset inventory will appear here</p>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </ClickableCard>
                </DraggableDashboardSection>
              );

            default:
              // Handle dynamic widgets
              if (itemId.startsWith('widget-')) {
                const widgetId = itemId.replace('widget-', '');
                const widget = dashboardWidgets.find(w => w.id === widgetId);
                if (!widget) return null;
                return (
                  <DraggableDashboardSection key={itemId} id={itemId} isDraggable={isRearrangeMode} label={widget.name} className={colClass}>
                    <DashboardWidget
                      widget={widget}
                      onRemove={handleRemoveWidget}
                      onMove={handleMoveWidget}
                      metrics={metrics}
                      isDraggable={isRearrangeMode}
                    />
                  </DraggableDashboardSection>
                );
              }
              return null;
          }
        };

        // Build colClass map for each item
        const getColClass = (itemId: string) => {
          const span = itemSpanConfig[itemId] || (itemId.startsWith('widget-') ? 3 : 12);
          return span === 3 ? 'col-span-6 lg:col-span-3' : span === 4 ? 'col-span-12 lg:col-span-4' : span === 8 ? 'col-span-12 lg:col-span-8' : 'col-span-12';
        };

        // Filter to only items that will render
        const renderableOrder = fullOrder.filter(itemId => {
          if (itemId.startsWith('widget-')) {
            const widgetId = itemId.replace('widget-', '');
            return dashboardWidgets.some(w => w.id === widgetId);
          }
          return defaultItemOrder.includes(itemId);
        });

        return (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleItemDragEnd}>
            <SortableContext items={renderableOrder} strategy={rectSortingStrategy}>
              <div className={`grid grid-cols-12 gap-3 md:gap-6 ${isRearrangeMode ? 'pl-4' : ''}`}>
                {renderableOrder.map(itemId => renderItem(itemId))}
              </div>
            </SortableContext>
          </DndContext>
        );
      })()}
    </div>
  );
}
