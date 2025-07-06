import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowUpIcon, ArrowDownIcon, DollarSign, TrendingUp, Users, Package, Settings, RotateCcw, BarChart3, Activity, Zap, Target, Award, Calendar } from "lucide-react";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { ExchangeChart } from "@/components/dashboard/ExchangeChart";
import { AddWidgetDialog } from "@/components/dashboard/AddWidgetDialog";
import { DashboardWidget } from "@/components/dashboard/DashboardWidget";
import { QuickLinksWidget } from "@/components/dashboard/QuickLinksWidget";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
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
      description: 'Current month revenue',
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
      id: 'revenue-chart',
      name: 'Revenue Chart',
      description: 'Monthly revenue trends and analytics',
      icon: TrendingUp,
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

  // Fetch dashboard metrics
  const { data: metrics } = useQuery({
    queryKey: ['dashboard_metrics'],
    queryFn: async () => {
      // Get total sales orders count and revenue
      const { data: salesData } = await supabase
        .from('sales_orders')
        .select('total_amount, created_at');

      // Get total purchase orders count and spending
      const { data: purchaseData } = await supabase
        .from('purchase_orders')
        .select('total_amount, created_at');

      // Get total clients count
      const { data: clientsData } = await supabase
        .from('clients')
        .select('id');

      // Get total products count
      const { data: productsData } = await supabase
        .from('products')
        .select('id');

      const totalSales = salesData?.length || 0;
      const totalRevenue = salesData?.reduce((sum, order) => sum + Number(order.total_amount), 0) || 0;
      const totalPurchases = purchaseData?.length || 0;
      const totalSpending = purchaseData?.reduce((sum, order) => sum + Number(order.total_amount), 0) || 0;
      const totalClients = clientsData?.length || 0;
      const totalProducts = productsData?.length || 0;

      return {
        totalSales,
        totalRevenue,
        totalPurchases,
        totalSpending,
        totalClients,
        totalProducts
      };
    },
  });

  // Fetch recent transactions for activity feed
  const { data: recentActivity } = useQuery({
    queryKey: ['recent_activity'],
    queryFn: async () => {
      // Get recent sales orders
      const { data: salesOrders } = await supabase
        .from('sales_orders')
        .select('id, order_number, client_name, total_amount, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

      // Get recent purchase orders
      const { data: purchaseOrders } = await supabase
        .from('purchase_orders')
        .select('id, order_number, supplier_name, total_amount, created_at')
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

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero Header with Flat Design */}
      <div className="relative overflow-hidden bg-blue-600 text-white">
        <div className="relative px-6 py-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-blue-700 rounded-xl shadow-lg">
                  <BarChart3 className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight">
                    Welcome to Dashboard
                  </h1>
                  <p className="text-blue-100 text-lg">
                    Monitor your business performance in real-time
                  </p>
                </div>
              </div>
              
              {/* Quick Stats in Header */}
              <div className="flex flex-wrap gap-4 mt-6">
                <div className="bg-blue-700 rounded-lg px-4 py-2 border-2 border-blue-500 shadow-md">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    <span className="text-sm font-medium">Today: {format(new Date(), "MMM dd, yyyy")}</span>
                  </div>
                </div>
                <div className="bg-green-600 rounded-lg px-4 py-2 border-2 border-green-500 shadow-md">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    <span className="text-sm font-medium">System Active</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Enhanced Controls */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              {/* Period Filter with Flat Design */}
              <div className="flex gap-1 p-1 bg-blue-700 rounded-lg border-2 border-blue-500">
                {["24h", "7d", "30d", "90d"].map((period) => (
                  <Button
                    key={period}
                    variant={selectedPeriod === period ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setSelectedPeriod(period)}
                    className={selectedPeriod === period ? 
                      "bg-white text-blue-600 shadow-md hover:bg-gray-50 border-2 border-white" : 
                      "text-white hover:bg-blue-600 border-2 border-transparent"
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
                    "bg-orange-500 border-2 border-orange-400 text-white hover:bg-orange-600 shadow-md" : 
                    "bg-white border-2 border-blue-300 text-blue-700 hover:bg-blue-50 shadow-md"
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
                  onClick={handleResetDashboard}
                  className="bg-white border-2 border-red-300 text-red-600 hover:bg-red-50 shadow-md"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reset
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-8">
        {/* Edit Mode Banner */}
        {isEditMode && (
          <div className="bg-orange-50 border-2 border-orange-200 text-orange-800 rounded-xl p-6 shadow-md">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-orange-500 rounded-xl flex items-center justify-center shadow-md">
                <Settings className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold">🎨 Edit Mode Active</h3>
                <p className="text-orange-700 mt-1">
                  Customize your dashboard by moving, removing, or adding widgets. Use the three-dot menu on each widget for options.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Enhanced Metrics Cards Grid with Flat Design */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Total Revenue Card */}
          <Card className="bg-green-500 text-white border-0 shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-1">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-100 text-sm font-medium">Total Revenue</p>
                  <p className="text-3xl font-bold mt-2">₹{(metrics?.totalRevenue || 0).toLocaleString()}</p>
                  <div className="flex items-center gap-1 mt-2">
                    <ArrowUpIcon className="h-4 w-4" />
                    <span className="text-sm font-medium">+12.5% from last month</span>
                  </div>
                </div>
                <div className="bg-green-600 p-3 rounded-xl shadow-lg">
                  <DollarSign className="h-8 w-8" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sales Orders Card */}
          <Card className="bg-blue-500 text-white border-0 shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-1">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100 text-sm font-medium">Sales Orders</p>
                  <p className="text-3xl font-bold mt-2">{metrics?.totalSales || 0}</p>
                  <div className="flex items-center gap-1 mt-2">
                    <ArrowUpIcon className="h-4 w-4" />
                    <span className="text-sm font-medium">+8.2% this week</span>
                  </div>
                </div>
                <div className="bg-blue-600 p-3 rounded-xl shadow-lg">
                  <TrendingUp className="h-8 w-8" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Active Clients Card */}
          <Card className="bg-purple-500 text-white border-0 shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-1">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-100 text-sm font-medium">Active Clients</p>
                  <p className="text-3xl font-bold mt-2">{metrics?.totalClients || 0}</p>
                  <div className="flex items-center gap-1 mt-2">
                    <ArrowUpIcon className="h-4 w-4" />
                    <span className="text-sm font-medium">+3.1% growth</span>
                  </div>
                </div>
                <div className="bg-purple-600 p-3 rounded-xl shadow-lg">
                  <Users className="h-8 w-8" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Products Card */}
          <Card className="bg-orange-500 text-white border-0 shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-1">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-orange-100 text-sm font-medium">Products</p>
                  <p className="text-3xl font-bold mt-2">{metrics?.totalProducts || 0}</p>
                  <div className="flex items-center gap-1 mt-2">
                    <ArrowUpIcon className="h-4 w-4" />
                    <span className="text-sm font-medium">+1.2% inventory</span>
                  </div>
                </div>
                <div className="bg-orange-600 p-3 rounded-xl shadow-lg">
                  <Package className="h-8 w-8" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Enhanced Quick Links Widget */}
        <QuickLinksWidget onRemove={handleRemoveWidget} />

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          {/* Chart Section */}
          <div className="xl:col-span-2 space-y-6">
            <Card className="bg-white border-2 border-gray-200 shadow-xl">
              <CardHeader className="bg-indigo-600 text-white rounded-t-lg">
                <CardTitle className="flex items-center gap-3 text-xl">
                  <div className="p-2 bg-indigo-700 rounded-lg shadow-md">
                    <BarChart3 className="h-6 w-6" />
                  </div>
                  Performance Analytics
                </CardTitle>
              </CardHeader>
              <CardContent className="p-8">
                <div className="h-80 flex items-center justify-center">
                  <div className="text-center space-y-4">
                    <div className="w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto shadow-lg">
                      <BarChart3 className="h-10 w-10 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-900 mb-2">Analytics Coming Soon</h3>
                      <p className="text-gray-600">Advanced charts and insights will be available here</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* Activity Feed */}
          <Card className="bg-white border-2 border-gray-200 shadow-xl">
            <CardHeader className="bg-blue-600 text-white rounded-t-lg">
              <CardTitle className="flex items-center gap-2 text-lg">
                <div className="p-2 bg-blue-700 rounded-lg shadow-md">
                  <Activity className="h-5 w-5" />
                </div>
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4 max-h-96 overflow-y-auto">
              {recentActivity?.slice(0, 8).map((activity) => (
                <div key={activity.id} className="flex items-center justify-between p-4 bg-white rounded-xl shadow-sm border-2 border-gray-100 hover:shadow-md transition-all duration-200">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${
                      activity.type === 'sale' ? 'bg-green-100' : 'bg-blue-100'
                    }`}>
                      {activity.type === 'sale' ? (
                        <ArrowUpIcon className="h-4 w-4 text-green-600" />
                      ) : (
                        <ArrowDownIcon className="h-4 w-4 text-blue-600" />
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-gray-900">{activity.title}</p>
                      <p className="text-xs text-gray-500">
                        {format(new Date(activity.timestamp), "MMM dd, HH:mm")}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold text-sm ${
                      activity.type === 'sale' ? 'text-green-600' : 'text-blue-600'
                    }`}>
                      {activity.type === 'sale' ? '+' : '-'}₹{Number(activity.amount).toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500">{activity.reference}</p>
                  </div>
                </div>
              ))}
              {(!recentActivity || recentActivity.length === 0) && (
                <div className="text-center py-12 text-gray-500">
                  <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Activity className="h-8 w-8 opacity-50" />
                  </div>
                  <p className="font-medium">No recent activity</p>
                  <p className="text-sm">Activity will appear here as you use the system</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

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
