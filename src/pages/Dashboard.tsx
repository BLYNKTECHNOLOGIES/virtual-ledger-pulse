import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowUpIcon, ArrowDownIcon, DollarSign, TrendingUp, Users, Wallet, Settings, RefreshCw, BarChart3, Activity, Zap, Target, Award, Calendar, Package, Building } from "lucide-react";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { ExchangeChart } from "@/components/dashboard/ExchangeChart";
import { AddWidgetDialog } from "@/components/dashboard/AddWidgetDialog";
import DashboardWidget from "@/components/dashboard/DashboardWidget";
import { QuickLinksWidget } from "@/components/dashboard/QuickLinksWidget";
import { InteractiveHeatmap } from "@/components/dashboard/InteractiveHeatmap";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, startOfDay, endOfDay, startOfMonth, endOfMonth } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { DateRange } from "react-day-picker";
import { DateRangePicker, DateRangePreset, getDateRangeFromPreset } from "@/components/ui/date-range-picker";

interface Widget {
  id: string;
  name: string;
  description: string;
  icon: any;
  category: string;
  size: 'small' | 'medium' | 'large';
}

export default function Dashboard() {
  const [datePreset, setDatePreset] = useState<DateRangePreset>("last7days");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(getDateRangeFromPreset("last7days"));
  const [dashboardWidgets, setDashboardWidgets] = useState<Widget[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const { toast } = useToast();

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
    const savedWidgets = localStorage.getItem('dashboardWidgets');
    if (savedWidgets) {
      setDashboardWidgets(JSON.parse(savedWidgets));
    } else {
      setDashboardWidgets(defaultWidgets);
    }
  }, []);

  // Save dashboard layout
  useEffect(() => {
    if (dashboardWidgets.length > 0) {
      localStorage.setItem('dashboardWidgets', JSON.stringify(dashboardWidgets));
    }
  }, [dashboardWidgets]);

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
      // Sync USDT stock first to ensure accurate stock values
      await supabase.rpc('sync_usdt_stock');
      
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
      const { data: bankData } = await supabase
        .from('bank_accounts')
        .select('balance, lien_amount')
        .eq('status', 'ACTIVE');

      // Get stock inventory data using cost_price for total value calculation
      const { data: stockData } = await supabase
        .from('products')
        .select('id, cost_price, current_stock_quantity');

      const totalSalesOrders = salesData?.length || 0;
      const totalSales = salesData?.reduce((sum, order) => sum + Number(order.total_amount), 0) || 0;
      const totalPurchases = purchaseData?.length || 0;
      const totalSpending = purchaseData?.reduce((sum, order) => sum + Number(order.total_amount), 0) || 0;
      const verifiedClients = clientsData?.length || 0;
      const totalClients = totalClientsData?.length || 0;
      
      // Calculate total cash (sum of available bank balances + stock value using cost_price)
      // Available Balance = Total Balance - Lien Amount
      const bankBalance = bankData?.reduce((sum, account) => {
        const availableBalance = Number(account.balance) - Number(account.lien_amount || 0);
        return sum + availableBalance;
      }, 0) || 0;
      const stockValue = stockData?.reduce((sum, product) => {
        return sum + (Number(product.cost_price || 0) * Number(product.current_stock_quantity));
      }, 0) || 0;
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
      // Sync USDT stock first
      try {
        await supabase.rpc('sync_usdt_stock');
      } catch (e) {
        console.log('sync_usdt_stock not available or failed', e);
      }
      
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
    localStorage.removeItem('dashboardWidgets');
    toast({
      title: "Dashboard Reset",
      description: "Dashboard has been reset to default layout.",
    });
  };

  const [isRefreshing, setIsRefreshing] = useState(false);

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

      <div className="space-y-4 md:space-y-8">
        {/* Edit Mode Banner */}
        {isEditMode && (
          <div className="bg-amber-50 border-2 border-amber-300 text-amber-800 rounded-xl p-4 md:p-6 shadow-md">
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

        {/* Enhanced Metrics Cards Grid - responsive */}
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
          {/* Total Sales Card */}
          <Card className="bg-white border-2 border-blue-100 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
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

          {/* Sales Orders Card */}
          <Card className="bg-white border-2 border-blue-100 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
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

          {/* Total Clients Card */}
          <Card className="bg-white border-2 border-blue-100 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
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

          {/* Total Cash Card */}
          <Card className="bg-white border-2 border-blue-100 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
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
        </div>

        {/* Enhanced Quick Links Widget */}
        <QuickLinksWidget onRemove={handleRemoveWidget} />

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          {/* Performance Analytics Section */}
          <div className="xl:col-span-2 space-y-6">
            <InteractiveHeatmap selectedPeriod={datePreset} />
          </div>
          
          {/* Activity Feed */}
          <Card className="bg-card border-2 border-border shadow-xl">
            <CardHeader className="bg-teal-600 text-white rounded-t-lg">
              <CardTitle className="flex items-center gap-2 text-lg">
                <div className="p-2 bg-teal-700 rounded-lg shadow-md">
                  <Activity className="h-5 w-5" />
                </div>
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4 overflow-y-auto">
              {recentActivity?.slice(0, 8).map((activity) => (
                <div key={activity.id} className="flex items-center justify-between p-4 bg-card rounded-xl shadow-sm border-2 border-border hover:shadow-md transition-all duration-200">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${
                      activity.type === 'sale' ? 'bg-emerald-100' : 'bg-muted'
                    }`}>
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
                    <p className={`font-bold text-sm ${
                      activity.type === 'sale' ? 'text-emerald-600' : 'text-muted-foreground'
                    }`}>
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
        </div>

        {/* Stock Inventory Section */}
        <Card className="bg-card border-2 border-border shadow-xl">
          <CardHeader className="bg-emerald-600 text-white rounded-t-lg">
            <CardTitle className="flex items-center gap-3 text-xl">
              <div className="p-2 bg-emerald-700 rounded-lg shadow-md">
                <Package className="h-6 w-6" />
              </div>
              Asset Inventory
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

        {/* Dynamic Widgets Grid */}
        {dashboardWidgets.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {dashboardWidgets.map((widget) => (
              <DashboardWidget
                key={widget.id}
                widget={widget}
                onRemove={handleRemoveWidget}
                onMove={handleMoveWidget}
                metrics={metrics}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
