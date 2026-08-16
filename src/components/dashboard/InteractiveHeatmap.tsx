
import { useState, useEffect } from "react";
import { WidgetShell, WidgetHeader, WidgetBody } from "./primitives/WidgetShell";
import { WidgetMetric, WidgetStatGrid } from "./primitives/WidgetAtoms";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, TrendingUp, TrendingDown, Activity } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Area, AreaChart } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
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
        // Use head:true count queries — they bypass the 1000-row data cap entirely
        const [{ count: totalClients }, { count: currentPeriodClientCount }] = await Promise.all([
          supabase.from('clients').select('id', { count: 'exact', head: true }),
          supabase
            .from('clients')
            .select('id', { count: 'exact', head: true })
            .gte('created_at', startOfDay(startDate).toISOString())
            .lte('created_at', endOfDay(endDate).toISOString()),
        ]);

        return {
          totalValue: totalClients || 0,
          currentPeriodValue: currentPeriodClientCount || 0,
          type: 'clients'
        };
      } else if (selectedMetric === 'orders') {
        const [{ count: totalOrders }, { count: currentPeriodOrders }] = await Promise.all([
          supabase.from('sales_orders').select('id', { count: 'exact', head: true }),
          supabase
            .from('sales_orders')
            .select('id', { count: 'exact', head: true })
            .gte('created_at', startOfDay(startDate).toISOString())
            .lte('created_at', endOfDay(endDate).toISOString()),
        ]);

        return {
          totalValue: totalOrders || 0,
          currentPeriodValue: currentPeriodOrders || 0,
          type: 'orders'
        };
      } else {
        // Sales totals: paginate to sum total_amount accurately across all rows
        const allSalesData = await fetchAllPaginated<{ total_amount: number; created_at: string; order_date: string }>(
          () => supabase
            .from('sales_orders')
            .select('total_amount, created_at, order_date')
            .order('order_date', { ascending: true })
        );

        const currentPeriodSales = await fetchAllPaginated<{ total_amount: number; created_at: string; order_date: string }>(
          () => supabase
            .from('sales_orders')
            .select('total_amount, created_at, order_date')
            .gte('created_at', startOfDay(startDate).toISOString())
            .lte('created_at', endOfDay(endDate).toISOString())
            .order('order_date', { ascending: true })
        );

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
      return `₹${value.toLocaleString('en-IN')}`;
    }
    return value.toString();
  };

  return (
    <WidgetShell>
      <WidgetHeader
        icon={BarChart3}
        title="Performance Analytics"
        subtitle={`${getMetricLabel()} · ${selectedPeriod}`}
        actions={
          <Select value={selectedMetric} onValueChange={setSelectedMetric}>
            <SelectTrigger className="h-7 w-36 text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sales">Sales Amount</SelectItem>
              <SelectItem value="clients">Clients</SelectItem>
              <SelectItem value="orders">Orders Count</SelectItem>
            </SelectContent>
          </Select>
        }
      />
      <WidgetBody className="space-y-3">
        <WidgetMetric
          label={`${getMetricLabel()} in selected period`}
          value={getMetricValue(chartData?.currentPeriodValue || 0)}
          helper={`All-time total ${getMetricValue(chartData?.totalValue || 0)}`}
          size="lg"
        />
        <WidgetStatGrid
          items={[
            {
              label: `Total ${getMetricLabel()}`,
              value: getMetricValue(chartData?.totalValue || 0),
              tone: 'success',
            },
            {
              label: `Current period`,
              value: getMetricValue(chartData?.currentPeriodValue || 0),
              tone: 'primary',
            },
          ]}
        />
      </WidgetBody>
    </WidgetShell>
  );
}
