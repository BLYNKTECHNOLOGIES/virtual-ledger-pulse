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
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface Widget {
  id: string;
  name: string;
  description: string;
  icon: any;
  category: string;
  size: 'small' | 'medium' | 'large';
}

export default function Dashboard() {
  const [selectedPeriod, setSelectedPeriod] = useState("7d");
  const [dashboardWidgets, setDashboardWidgets] = useState<Widget[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const { toast } = useToast();

  // Default widgets with better selection
  const defaultWidgets = [
    {
      id: 'total-revenue',
      name: 'Total Revenue',
      description: 'Current period revenue',
      icon: DollarSign,
      category: 'Metrics',
      size: 'small' as const
    },
    {
      id: 'total-clients',
      name: 'Total Clients',
      description: 'Quick view of total client count',
      icon: Users,
      category: 'Metrics',
      size: 'small' as const
    },
    {
      id: 'stock-inventory',
      name: 'Stock Inventory',
      description: 'Warehouse stock overview',
      icon: Package,
      category: 'Analytics',
      size: 'large' as const
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

  // Calculate date range based on selected period
  const getDateRange = () => {
    const now = new Date();
    switch (selectedPeriod) {
      case "24h":
        return { start: subDays(now, 1), end: now };
      case "7d":
        return { start: subDays(now, 7), end: now };
      case "30d":
        return { start: subDays(now, 30), end: now };
      case "90d":
        return { start: subDays(now, 90), end: now };
      default:
        return { start: subDays(now, 7), end: now };
    }
  };

  const { start: startDate, end: endDate } = getDateRange();

  // Fetch dashboard metrics with period filtering
  const { data: metrics, refetch: refetchMetrics } = useQuery({
    queryKey: ['dashboard_metrics', selectedPeriod],
    queryFn: async () => {
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

      // Get active bank accounts and their balances
      const { data: bankData } = await supabase
        .from('bank_accounts')
        .select('balance')
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
      
      // Calculate total cash (sum of active bank balances + stock value using cost_price)
      const bankBalance = bankData?.reduce((sum, account) => sum + Number(account.balance), 0) || 0;
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

  // Fetch warehouse stock data
  const { data: warehouseStock, refetch: refetchWarehouseStock } = useQuery({
    queryKey: ['warehouse_stock'],
    queryFn: async () => {
      // Sync stock data first
      await supabase.rpc('sync_product_warehouse_stock');
      
      const { data: warehouses } = await supabase
        .from('warehouses')
        .select('*')
        .eq('is_active', true);

      const { data: products } = await supabase
        .from('products')
        .select('id, name, code, current_stock_quantity, warehouse_id');

      // Group products by warehouse
      const warehouseStockMap = new Map();
      
      warehouses?.forEach(warehouse => {
        const warehouseProducts = products?.filter(p => p.warehouse_id === warehouse.id) || [];
        warehouseStockMap.set(warehouse.id, {
          id: warehouse.id,
          name: warehouse.name,
          location: warehouse.location,
          products: warehouseProducts,
          totalProducts: warehouseProducts.length,
          totalQuantity: warehouseProducts.reduce((sum, p) => sum + Number(p.current_stock_quantity), 0)
        });
      });

      return Array.from(warehouseStockMap.values());
    },
    refetchInterval: 30000,
  });

  // Fetch recent transactions for activity feed with period filtering
  const { data: recentActivity, refetch: refetchActivity } = useQuery({
    queryKey: ['recent_activity', selectedPeriod],
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
    <div className="min-h-screen bg-slate-50">
      {/* Hero Header with Professional Gradient Background */}
      <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 text-white">
        <div className="absolute inset-0 bg-black/10"></div>
        <div className="relative px-6 py-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-secondary rounded-xl shadow-lg">
                  <BarChart3 className="h-8 w-8 text-secondary-foreground" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-white">
                    Welcome to Dashboard
                  </h1>
                  <p className="text-slate-300 text-lg">
                    Monitor your business performance in real-time
                  </p>
                </div>
              </div>
              
              {/* Quick Stats in Header */}
              <div className="flex flex-wrap gap-4 mt-6">
                <div className="bg-blue-800 text-white rounded-lg px-4 py-2 border-2 border-blue-700 shadow-md">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    <span className="text-sm font-medium">Today: {format(new Date(), "MMM dd, yyyy")}</span>
                  </div>
                </div>
                <div className="bg-emerald-700 rounded-lg px-4 py-2 border-2 border-emerald-600 shadow-md">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    <span className="text-sm font-medium">System Active</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Enhanced Controls */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              {/* Period Filter with Professional Design */}
              <div className="flex gap-1 p-1 bg-secondary rounded-lg border-2 border-border">
                {["24h", "7d", "30d", "90d"].map((period) => (
                  <Button
                    key={period}
                    variant={selectedPeriod === period ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setSelectedPeriod(period)}
                    className={selectedPeriod === period ? 
                      "bg-primary text-primary-foreground shadow-md hover:bg-primary/90 border-2 border-primary" : 
                      "text-secondary-foreground hover:bg-muted border-2 border-transparent"
                    }
                  >
                    {period}
                  </Button>
                ))}
              </div>
              
              {/* Dashboard Controls */}
              <div className="flex items-center gap-3 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditMode(!isEditMode)}
                  className={isEditMode ? 
                    "bg-amber-600 border-2 border-amber-500 text-white hover:bg-amber-700 shadow-md" : 
                    "bg-card border-2 border-border text-foreground hover:bg-muted shadow-md"
                  }
                >
                  <Settings className="h-4 w-4 mr-2" />
                  {isEditMode ? 'Exit Edit' : 'Edit Mode'}
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
                  className="bg-card border-2 border-border text-foreground hover:bg-muted shadow-md"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                  {isRefreshing ? 'Refreshing...' : 'Refresh'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-8">
        {/* Edit Mode Banner */}
        {isEditMode && (
          <div className="bg-amber-50 border-2 border-amber-300 text-amber-800 rounded-xl p-6 shadow-md">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-amber-600 rounded-xl flex items-center justify-center shadow-md">
                <Settings className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold">🎨 Edit Mode Active</h3>
                <p className="text-amber-700 mt-1">
                  Customize your dashboard by moving, removing, or adding widgets. Use the three-dot menu on each widget for options.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Enhanced Metrics Cards Grid with Professional Colors */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Total Sales Card */}
          <Card className="bg-emerald-600 text-white border-0 shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-1">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-emerald-100 text-sm font-medium">Total Sales</p>
                  <p className="text-2xl xl:text-3xl font-bold mt-2 truncate">₹{(metrics?.totalSales || 0).toLocaleString()}</p>
                  <div className="flex items-center gap-1 mt-2">
                    <ArrowUpIcon className="h-4 w-4" />
                    <span className="text-sm font-medium">Period: {selectedPeriod}</span>
                  </div>
                </div>
                <div className="bg-emerald-700 p-3 rounded-xl shadow-lg flex-shrink-0">
                  <DollarSign className="h-8 w-8" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sales Orders Card */}
          <Card className="bg-purple-600 text-white border-0 shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-1">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-purple-100 text-sm font-medium">Sales Orders</p>
                  <p className="text-2xl xl:text-3xl font-bold mt-2 truncate">{metrics?.totalSalesOrders || 0}</p>
                  <div className="flex items-center gap-1 mt-2">
                    <ArrowUpIcon className="h-4 w-4" />
                    <span className="text-sm font-medium">Period: {selectedPeriod}</span>
                  </div>
                </div>
                <div className="bg-purple-700 p-3 rounded-xl shadow-lg flex-shrink-0">
                  <TrendingUp className="h-8 w-8" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Total Clients Card */}
          <Card className="bg-indigo-600 text-white border-0 shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-1">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-indigo-100 text-sm font-medium">Total Clients</p>
                  <p className="text-2xl xl:text-3xl font-bold mt-2 truncate">{metrics?.totalClients || 0}</p>
                  <div className="flex items-center gap-1 mt-2">
                    <ArrowUpIcon className="h-4 w-4" />
                    <span className="text-sm font-medium">Verified: {metrics?.verifiedClients || 0}</span>
                  </div>
                </div>
                <div className="bg-indigo-700 p-3 rounded-xl shadow-lg flex-shrink-0">
                  <Users className="h-8 w-8" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Total Cash Card */}
          <Card className="bg-amber-600 text-white border-0 shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-1">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0 relative z-10">
                  <p className="text-amber-100 text-sm font-medium">Total Cash</p>
                  <div className="text-xl xl:text-2xl font-bold mt-2 leading-tight break-words">
                    ₹{(metrics?.totalCash || 0).toLocaleString()}
                  </div>
                  <div className="flex items-center gap-1 mt-2">
                    <ArrowUpIcon className="h-4 w-4" />
                    <span className="text-sm font-medium">Banks + Stock</span>
                  </div>
                </div>
                <div className="bg-amber-700 p-3 rounded-xl shadow-lg flex-shrink-0 relative z-0">
                  <Wallet className="h-8 w-8" />
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
            <InteractiveHeatmap selectedPeriod={selectedPeriod} />
          </div>
          
          {/* Activity Feed */}
          <Card className="bg-card border-2 border-border shadow-xl">
            <CardHeader className="bg-teal-600 text-white rounded-t-lg">
              <CardTitle className="flex items-center gap-2 text-lg">
                <div className="p-2 bg-teal-700 rounded-lg shadow-md">
                  <Activity className="h-5 w-5" />
                </div>
                Recent Activity ({selectedPeriod})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4 max-h-96 overflow-y-auto">
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
                  <p className="font-medium">No activity in {selectedPeriod}</p>
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
              Stock Inventory
            </CardTitle>
          </CardHeader>
          <CardContent className="p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {warehouseStock?.map((warehouse, index) => (
                <Card key={warehouse.id || index} className="border-2 border-border hover:shadow-lg transition-all duration-300">
                  <CardHeader className="bg-secondary border-b">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Building className="h-5 w-5 text-muted-foreground" />
                        {warehouse.name}
                      </CardTitle>
                      <Badge className="bg-muted text-foreground">{warehouse.totalProducts} Products</Badge>
                    </div>
                    {warehouse.location && (
                      <p className="text-sm text-muted-foreground">{warehouse.location}</p>
                    )}
                  </CardHeader>
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-foreground">Total Quantity</span>
                        <Badge className="bg-emerald-100 text-emerald-800 font-bold">
                          {warehouse.totalQuantity.toLocaleString()}
                        </Badge>
                      </div>
                      
                      <div className="border-t pt-3">
                        <h4 className="text-sm font-semibold text-foreground mb-2">Top Products</h4>
                        <div className="space-y-2 max-h-32 overflow-y-auto">
                          {warehouse.products.slice(0, 5).map((product: any, idx: number) => (
                            <div key={idx} className="flex justify-between text-xs">
                              <span className="text-muted-foreground truncate pr-2">{product.name}</span>
                              <span className="font-medium text-foreground whitespace-nowrap">
                                {Number(product.current_stock_quantity).toLocaleString()}
                              </span>
                            </div>
                          ))}
                          {warehouse.products.length > 5 && (
                            <div className="text-xs text-muted-foreground italic">
                              +{warehouse.products.length - 5} more products
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              
              {(!warehouseStock || warehouseStock.length === 0) && (
                <div className="col-span-full text-center py-12 text-muted-foreground">
                  <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Package className="h-8 w-8 opacity-50" />
                  </div>
                  <p className="font-medium">No warehouse data available</p>
                  <p className="text-sm">Stock information will appear here</p>
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
