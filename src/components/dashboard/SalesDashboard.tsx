import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Users, ShoppingCart, DollarSign } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MetricCard } from "./MetricCard";
import { QuickAccessCard } from "./QuickAccessCard";

export function SalesDashboard() {
  // Fetch sales-specific metrics
  const { data: salesMetrics } = useQuery({
    queryKey: ['sales-metrics'],
    queryFn: async () => {
      const { data: orders, error } = await supabase
        .from('sales_orders')
        .select('total_amount, status, created_at')
        .order('created_at', { ascending: false });
      
      if (error) throw error;

      const today = new Date();
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      
      const monthlyOrders = orders?.filter(o => new Date(o.created_at) >= startOfMonth) || [];
      const totalSales = monthlyOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
      const completedOrders = monthlyOrders.filter(o => o.status === 'COMPLETED').length;
      
      return {
        totalSales,
        orderCount: monthlyOrders.length,
        completedOrders,
        avgOrderValue: monthlyOrders.length > 0 ? totalSales / monthlyOrders.length : 0
      };
    }
  });

  const quickLinks = [
    { title: "New Sale", description: "Create sales order", href: "/sales", icon: "shopping-cart" },
    { title: "View Clients", description: "Manage clients", href: "/clients", icon: "users" },
    { title: "Sales Reports", description: "View analytics", href: "/statistics", icon: "package" }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Sales Dashboard</h1>
        <p className="text-muted-foreground mt-1">Track your sales performance</p>
      </div>

      {/* Sales Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Sales (Month)"
          value={`₹${(salesMetrics?.totalSales || 0).toLocaleString()}`}
          icon={DollarSign}
          change="+15%"
          trend="up"
        />
        <MetricCard
          title="Orders"
          value={String(salesMetrics?.orderCount || 0)}
          icon={ShoppingCart}
          change={`${salesMetrics?.completedOrders || 0} done`}
          trend="up"
        />
        <MetricCard
          title="Avg Order Value"
          value={`₹${(salesMetrics?.avgOrderValue || 0).toFixed(2)}`}
          icon={TrendingUp}
          change="+5%"
          trend="up"
        />
        <MetricCard
          title="Completion Rate"
          value={`${salesMetrics?.orderCount ? ((salesMetrics.completedOrders / salesMetrics.orderCount) * 100).toFixed(1) : 0}%`}
          icon={TrendingUp}
          change="Good"
          trend="up"
        />
      </div>

      {/* Quick Links */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {quickLinks.map((link) => (
              <QuickAccessCard key={link.title} {...link} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
