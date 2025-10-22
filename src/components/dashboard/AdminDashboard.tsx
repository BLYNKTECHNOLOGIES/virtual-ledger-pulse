import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, TrendingUp, Users, Wallet } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MetricCard } from "./MetricCard";
import { useState } from "react";

export function AdminDashboard() {
  const [selectedPeriod] = useState("7d");

  // Fetch comprehensive admin metrics
  const { data: adminMetrics } = useQuery({
    queryKey: ['admin-metrics'],
    queryFn: async () => {
      const { data: salesOrders } = await supabase
        .from('sales_orders')
        .select('total_amount, status');
      
      const { data: clients } = await supabase
        .from('clients')
        .select('id, kyc_status');
      
      const { data: bankAccounts } = await supabase
        .from('bank_accounts')
        .select('balance');

      const totalSales = salesOrders?.reduce((sum, o) => sum + Number(o.total_amount || 0), 0) || 0;
      const orderCount = salesOrders?.length || 0;
      const verifiedClients = clients?.filter(c => c.kyc_status === 'VERIFIED').length || 0;
      
      const bankBalance = bankAccounts?.reduce((sum, a) => sum + Number(a.balance || 0), 0) || 0;

      return {
        totalSales,
        orderCount,
        totalClients: clients?.length || 0,
        verifiedClients,
        totalCash: bankBalance,
        bankBalance
      };
    }
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Admin Dashboard</h1>
        <p className="text-muted-foreground mt-1">Complete business overview</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Sales"
          value={`₹${(adminMetrics?.totalSales || 0).toLocaleString()}`}
          icon={DollarSign}
          change="+12%"
          trend="up"
        />
        <MetricCard
          title="Sales Orders"
          value={String(adminMetrics?.orderCount || 0)}
          icon={TrendingUp}
          change="+8%"
          trend="up"
        />
        <MetricCard
          title="Total Clients"
          value={String(adminMetrics?.totalClients || 0)}
          icon={Users}
          change={`${adminMetrics?.verifiedClients || 0} verified`}
          trend="up"
        />
        <MetricCard
          title="Total Cash"
          value={`₹${((adminMetrics?.totalCash || 0) / 100000).toFixed(2)}L`}
          icon={Wallet}
          change="Banks balance"
          trend="up"
        />
      </div>

      {/* Additional Admin Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Financial Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Bank Balance</span>
                <span className="font-semibold">₹{(adminMetrics?.bankBalance || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t">
                <span className="font-medium">Total Assets</span>
                <span className="font-bold text-lg">₹{((adminMetrics?.totalCash || 0) / 100000).toFixed(2)}L</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>System Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Sales Module</span>
                <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-xs font-medium">Active</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">BAMS Module</span>
                <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-xs font-medium">Active</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Compliance</span>
                <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-xs font-medium">Active</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
