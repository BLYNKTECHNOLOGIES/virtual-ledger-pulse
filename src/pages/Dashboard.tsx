import { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ArrowUpIcon, ArrowDownIcon } from "lucide-react";
import { QuickAccessCard } from "@/components/dashboard/QuickAccessCard";
import { ExchangeChart } from "@/components/dashboard/ExchangeChart";
import { DashboardMetrics } from "@/components/dashboard/DashboardMetrics";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
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
      <DashboardMetrics metrics={metrics} />

      {/* Charts and Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart */}
        <div className="lg:col-span-2">
          <ExchangeChart />
        </div>

        {/* Recent Activity */}
        <RecentActivity activities={recentActivity} />
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
