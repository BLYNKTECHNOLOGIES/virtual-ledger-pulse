
import { memo } from "react";
import { DollarSign, TrendingUp, Users, Package } from "lucide-react";
import { MetricCard } from "./MetricCard";

interface DashboardMetricsProps {
  metrics?: {
    totalRevenue: number;
    totalSales: number;
    totalClients: number;
    totalProducts: number;
  };
}

export const DashboardMetrics = memo(function DashboardMetrics({ metrics }: DashboardMetricsProps) {
  return (
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
  );
});
