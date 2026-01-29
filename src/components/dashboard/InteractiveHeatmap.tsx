
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, TrendingUp, TrendingDown, Activity } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Area, AreaChart } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, startOfDay, endOfDay, eachDayOfInterval, subMonths, startOfMonth, endOfMonth, startOfYear, endOfYear, subYears } from "date-fns";

interface SalesData {
  date: string;
  currentSales: number;
  averageSales: number;
  yesterdaySales: number;
}

interface InteractiveHeatmapProps {
  selectedPeriod: string;
}

export function InteractiveHeatmap({ selectedPeriod }: InteractiveHeatmapProps) {
  const [selectedMetric, setSelectedMetric] = useState("sales");

  // Calculate date range based on selected period (supporting both old and new formats)
  const getDateRange = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (selectedPeriod) {
      // Legacy formats
      case "24h":
        return { start: subDays(now, 1), end: now };
      case "7d":
        return { start: subDays(now, 7), end: now };
      case "30d":
        return { start: subDays(now, 30), end: now };
      case "90d":
        return { start: subDays(now, 90), end: now };
      // New preset formats
      case "today":
        return { start: today, end: today };
      case "yesterday":
        return { start: subDays(today, 1), end: subDays(today, 1) };
      case "last7days":
        return { start: subDays(today, 6), end: today };
      case "last30days":
        return { start: subDays(today, 29), end: today };
      case "thisMonth":
        return { start: startOfMonth(today), end: endOfMonth(today) };
      case "lastMonth":
        const lastMonth = subMonths(today, 1);
        return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
      case "last3months":
        return { start: subMonths(today, 3), end: today };
      case "last6months":
        return { start: subMonths(today, 6), end: today };
      case "thisYear":
        return { start: startOfYear(today), end: endOfYear(today) };
      case "lastYear":
        const lastYear = subYears(today, 1);
        return { start: startOfYear(lastYear), end: endOfYear(lastYear) };
      default:
        return { start: subDays(now, 7), end: now };
    }
  };

  const { start: startDate, end: endDate } = getDateRange();

  // Fetch chart data based on selected metric
  const { data: chartData } = useQuery({
    queryKey: ['chart_data', selectedPeriod, selectedMetric],
    queryFn: async () => {
      if (selectedMetric === 'clients') {
        // Get all clients data
        const { data: allClientsData } = await supabase
          .from('clients')
          .select('id, created_at, date_of_onboarding')
          .order('date_of_onboarding', { ascending: true });

        // Get clients for current period
        const { data: currentPeriodClients } = await supabase
          .from('clients')
          .select('id, created_at, date_of_onboarding')
          .gte('created_at', startOfDay(startDate).toISOString())
          .lte('created_at', endOfDay(endDate).toISOString())
          .order('date_of_onboarding', { ascending: true });

        // Calculate total clients count
        const totalClients = allClientsData?.length || 0;
        const currentPeriodClientCount = currentPeriodClients?.length || 0;

        return {
          totalValue: totalClients,
          currentPeriodValue: currentPeriodClientCount,
          type: 'clients'
        };
      } else if (selectedMetric === 'orders') {
        // Get all sales orders
        const { data: allOrdersData } = await supabase
          .from('sales_orders')
          .select('id, created_at, order_date')
          .order('order_date', { ascending: true });

        // Get orders for current period
        const { data: currentPeriodOrders } = await supabase
          .from('sales_orders')
          .select('id, created_at, order_date')
          .gte('created_at', startOfDay(startDate).toISOString())
          .lte('created_at', endOfDay(endDate).toISOString())
          .order('order_date', { ascending: true });

        return {
          totalValue: allOrdersData?.length || 0,
          currentPeriodValue: currentPeriodOrders?.length || 0,
          type: 'orders'
        };
      } else {
        // Default to sales data
        const { data: allSalesData } = await supabase
          .from('sales_orders')
          .select('total_amount, created_at, order_date')
          .order('order_date', { ascending: true });

        const { data: currentPeriodSales } = await supabase
          .from('sales_orders')
          .select('total_amount, created_at, order_date')
          .gte('created_at', startOfDay(startDate).toISOString())
          .lte('created_at', endOfDay(endDate).toISOString())
          .order('order_date', { ascending: true });

        const totalSales = allSalesData?.reduce((sum, order) => sum + Number(order.total_amount), 0) || 0;
        const currentPeriodSalesTotal = currentPeriodSales?.reduce((sum, order) => sum + Number(order.total_amount), 0) || 0;

        return {
          totalValue: totalSales,
          currentPeriodValue: currentPeriodSalesTotal,
          type: 'sales'
        };
      }

    },
  });

  const getMetricLabel = () => {
    switch (selectedMetric) {
      case 'clients':
        return 'Clients';
      case 'orders':
        return 'Orders';
      default:
        return 'Sales Amount';
    }
  };

  const getMetricValue = (value: number) => {
    if (selectedMetric === 'sales') {
      return `₹${value.toLocaleString()}`;
    }
    return value.toString();
  };

  return (
    <Card className="bg-card border-2 border-border shadow-xl">
      <CardHeader className="bg-secondary text-secondary-foreground rounded-t-lg">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-3 text-xl">
            <div className="p-2 bg-muted rounded-lg shadow-md">
              <BarChart3 className="h-6 w-6" />
            </div>
            Performance Analytics
          </CardTitle>
          <Select value={selectedMetric} onValueChange={setSelectedMetric}>
            <SelectTrigger className="w-40 bg-card text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sales">Sales Amount</SelectItem>
              <SelectItem value="clients">Clients</SelectItem>
              <SelectItem value="orders">Orders Count</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="p-8">
        {/* Metric Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <Card className="border-2 border-emerald-200 bg-emerald-50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-emerald-700">Total {getMetricLabel()}</p>
                  <p className="text-2xl font-bold text-emerald-800">{getMetricValue(chartData?.totalValue || 0)}</p>
                </div>
                <TrendingUp className="h-8 w-8 text-emerald-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-indigo-200 bg-indigo-50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-indigo-700">Current Period {getMetricLabel()}</p>
                  <p className="text-2xl font-bold text-indigo-800">{getMetricValue(chartData?.currentPeriodValue || 0)}</p>
                </div>
                <BarChart3 className="h-8 w-8 text-indigo-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Performance Overview */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">{getMetricLabel()} Performance Overview</h3>
          <div className="text-center p-8 bg-muted rounded-lg">
            <div className="text-4xl font-bold text-primary mb-2">
              {getMetricValue(chartData?.currentPeriodValue || 0)}
            </div>
            <p className="text-muted-foreground">
              {getMetricLabel()} in selected period ({selectedPeriod})
            </p>
            <div className="mt-4 text-sm text-muted-foreground">
              Total all-time: {getMetricValue(chartData?.totalValue || 0)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
