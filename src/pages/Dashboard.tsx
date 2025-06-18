
import { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowUpIcon, ArrowDownIcon, DollarSign, TrendingUp, Users, Package } from "lucide-react";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { QuickAccessCard } from "@/components/dashboard/QuickAccessCard";
import { ExchangeChart } from "@/components/dashboard/ExchangeChart";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

export default function Dashboard() {
  const [selectedPeriod, setSelectedPeriod] = useState("7d");

  // Fetch dashboard metrics with optimized query (only fetch what we need)
  const { data: metrics } = useQuery({
    queryKey: ['dashboard_metrics'],
    queryFn: async () => {
      // Use Promise.all for parallel requests
      const [salesData, purchaseData, clientsData, productsData] = await Promise.all([
        supabase
          .from('sales_orders')
          .select('total_amount, created_at'),
        supabase
          .from('purchase_orders')
          .select('total_amount, created_at'),
        supabase
          .from('clients')
          .select('id'),
        supabase
          .from('products')
          .select('id')
      ]);

      const totalSales = salesData.data?.length || 0;
      const totalRevenue = salesData.data?.reduce((sum, order) => sum + Number(order.total_amount), 0) || 0;
      const totalPurchases = purchaseData.data?.length || 0;
      const totalSpending = purchaseData.data?.reduce((sum, order) => sum + Number(order.total_amount), 0) || 0;
      const totalClients = clientsData.data?.length || 0;
      const totalProducts = productsData.data?.length || 0;

      return {
        totalSales,
        totalRevenue,
        totalPurchases,
        totalSpending,
        totalClients,
        totalProducts
      };
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Fetch recent transactions for activity feed with pagination
  const { data: recentActivity } = useQuery({
    queryKey: ['recent_activity'],
    queryFn: async () => {
      // Limit initial fetch and use parallel requests
      const [salesOrders, purchaseOrders] = await Promise.all([
        supabase
          .from('sales_orders')
          .select('id, order_number, client_name, total_amount, created_at')
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('purchase_orders')
          .select('id, order_number, supplier_name, total_amount, created_at')
          .order('created_at', { ascending: false })
          .limit(5)
      ]);

      // Combine and sort by date
      const allActivity = [
        ...(salesOrders.data || []).map(order => ({
          id: order.id,
          type: 'sale' as const,
          title: `Sale to ${order.client_name}`,
          amount: order.total_amount,
          reference: order.order_number,
          timestamp: order.created_at
        })),
        ...(purchaseOrders.data || []).map(order => ({
          id: order.id,
          type: 'purchase' as const,
          title: `Purchase from ${order.supplier_name}`,
          amount: order.total_amount,
          reference: order.order_number,
          timestamp: order.created_at
        }))
      ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
       .slice(0, 10);

      return allActivity;
    },
    staleTime: 2 * 60 * 1000, // Cache for 2 minutes
  });

  // Memoize period buttons to prevent unnecessary re-renders
  const periodButtons = useMemo(() => 
    ["24h", "7d", "30d", "90d"].map((period) => (
      <Button
        key={period}
        variant={selectedPeriod === period ? "default" : "outline"}
        size="sm"
        onClick={() => setSelectedPeriod(period)}
      >
        {period}
      </Button>
    )), [selectedPeriod]
  );

  // Memoized activity renderer
  const activityItems = useMemo(() => 
    recentActivity?.map((activity) => (
      <div key={activity.id} className="flex items-center justify-between border-b pb-3 last:border-0">
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
            <p className="font-medium text-sm">{activity.title}</p>
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
    )) || [], [recentActivity]
  );

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1">Welcome back! Here's what's happening with your business.</p>
        </div>
        <div className="flex gap-2">
          {periodButtons}
        </div>
      </div>

      {/* Metrics Cards */}
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

      {/* Charts and Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart */}
        <div className="lg:col-span-2">
          <ExchangeChart />
        </div>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {activityItems.length > 0 ? activityItems : (
              <div className="text-center py-4 text-gray-500 text-sm">
                No recent activity
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <QuickAccessCard
          title="New Sale"
          description="Create a new sales order"
          href="/sales"
          icon="plus"
        />
        <QuickAccessCard
          title="Add Product"
          description="Add new product to inventory"
          href="/stock"
          icon="package"
        />
        <QuickAccessCard
          title="New Client"
          description="Register a new client"
          href="/clients"
          icon="users"
        />
        <QuickAccessCard
          title="Purchase Order"
          description="Create new purchase order"
          href="/purchase"
          icon="shopping-cart"
        />
      </div>
    </div>
  );
}
