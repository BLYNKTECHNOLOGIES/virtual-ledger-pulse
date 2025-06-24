import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowUpIcon, ArrowDownIcon, DollarSign, TrendingUp, Users, Package, Settings, RotateCcw, BarChart3, Activity } from "lucide-react";
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
    <div className="h-full w-full overflow-auto">
      <div className="space-y-4 sm:space-y-6 p-4 sm:p-6 max-w-7xl mx-auto">
        {/* Enhanced Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-4xl font-bold bg-gradient-to-r from-gray-900 via-blue-800 to-purple-800 bg-clip-text text-transparent">
              Dashboard
            </h1>
            <p className="text-gray-600 mt-2 text-sm sm:text-lg">Welcome back! Here's what's happening with your business today.</p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            {/* Period Filter */}
            <div className="flex gap-2 p-1 bg-white rounded-lg shadow-sm border">
              {["24h", "7d", "30d", "90d"].map((period) => (
                <Button
                  key={period}
                  variant={selectedPeriod === period ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setSelectedPeriod(period)}
                  className={selectedPeriod === period ? 
                    "bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-sm" : 
                    "hover:bg-blue-50 text-gray-700"
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
                  "bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100" : 
                  "hover:bg-blue-50 border-gray-200"
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
                className="hover:bg-red-50 hover:border-red-200 hover:text-red-700"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
            </div>
          </div>
        </div>

        {/* Edit Mode Banner */}
        {isEditMode && (
          <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl p-4 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-white to-gray-50 rounded-lg flex items-center justify-center">
                <Settings className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold">Edit Mode Active</h3>
                <p className="text-blue-100 text-sm">
                  Use the three-dot menu on each widget to move or remove them. Add new widgets using the "Add Widget" button above.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Quick Links Widget */}
        <QuickLinksWidget onRemove={handleRemoveWidget} />

        {/* Dynamic Widgets Grid */}
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

        {/* Enhanced Recent Activity */}
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          <div className="xl:col-span-3">
            {/* Placeholder for additional dashboard content */}
            <Card className="h-64 bg-gradient-to-br from-white to-gray-50 border-0 shadow-sm">
              <CardContent className="h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <BarChart3 className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Add More Widgets</h3>
                  <p className="text-gray-600 text-sm">Click "Add Widget" to customize your dashboard with more analytics and metrics.</p>
                </div>
              </CardContent>
            </Card>
          </div>
          
          <Card className="bg-white shadow-sm border-0">
            <CardHeader className="bg-gradient-to-r from-gray-50 to-gray-100">
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-blue-600" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-4">
              {recentActivity?.slice(0, 6).map((activity) => (
                <div key={activity.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${
                      activity.type === 'sale' ? 'bg-green-100' : 'bg-blue-100'
                    }`}>
                      {activity.type === 'sale' ? (
                        <ArrowUpIcon className="h-4 w-4 text-green-600" />
                      ) : (
                        <ArrowDownIcon className="h-4 w-4 text-blue-600" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-sm text-gray-900">{activity.title}</p>
                      <p className="text-xs text-gray-500">
                        {format(new Date(activity.timestamp), "MMM dd, HH:mm")}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold text-sm ${
                      activity.type === 'sale' ? 'text-green-600' : 'text-blue-600'
                    }`}>
                      {activity.type === 'sale' ? '+' : '-'}₹{Number(activity.amount).toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500">{activity.reference}</p>
                  </div>
                </div>
              ))}
              {(!recentActivity || recentActivity.length === 0) && (
                <div className="text-center py-8 text-gray-500">
                  <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No recent activity</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Default Metrics for new users */}
        {dashboardWidgets.length === 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <MetricCard
              title="Total Revenue"
              value={`₹${(metrics?.totalRevenue || 0).toLocaleString()}`}
              change="+12.5%"
              trend="up"
              icon={DollarSign}
            />
            <MetricCard
              title="Sales Orders"
              value={metrics?.totalSales?.toString() || "0"}
              change="+8.2%"
              trend="up"
              icon={TrendingUp}
            />
            <MetricCard
              title="Active Clients"
              value={metrics?.totalClients?.toString() || "0"}
              change="+3.1%"
              trend="up"
              icon={Users}
            />
            <MetricCard
              title="Products"
              value={metrics?.totalProducts?.toString() || "0"}
              change="+1.2%"
              trend="up"
              icon={Package}
            />
          </div>
        )}
      </div>
    </div>
  );
}
