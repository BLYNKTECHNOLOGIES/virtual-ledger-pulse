
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, TrendingUp, TrendingDown, Activity } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Area, AreaChart } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, startOfDay, endOfDay, eachDayOfInterval } from "date-fns";

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

  // Fetch sales data for chart
  const { data: salesChartData } = useQuery({
    queryKey: ['sales_chart_data', selectedPeriod],
    queryFn: async () => {
      // Get all sales data
      const { data: allSalesData } = await supabase
        .from('sales_orders')
        .select('total_amount, created_at, order_date')
        .order('order_date', { ascending: true });

      // Get sales for current period
      const { data: currentPeriodSales } = await supabase
        .from('sales_orders')
        .select('total_amount, created_at, order_date')
        .gte('created_at', startOfDay(startDate).toISOString())
        .lte('created_at', endOfDay(endDate).toISOString())
        .order('order_date', { ascending: true });

      // Get yesterday's sales
      const yesterday = subDays(new Date(), 1);
      const { data: yesterdaySalesData } = await supabase
        .from('sales_orders')
        .select('total_amount, created_at, order_date')
        .gte('created_at', startOfDay(yesterday).toISOString())
        .lte('created_at', endOfDay(yesterday).toISOString());

      // Calculate all-time average daily sales
      const totalAllTimeSales = allSalesData?.reduce((sum, order) => sum + Number(order.total_amount), 0) || 0;
      const totalDaysWithSales = new Set(allSalesData?.map(order => order.order_date) || []).size || 1;
      const allTimeAverageDailySales = totalAllTimeSales / totalDaysWithSales;

      // Calculate yesterday's total sales
      const yesterdayTotal = yesterdaySalesData?.reduce((sum, order) => sum + Number(order.total_amount), 0) || 0;

      // Create date range for chart
      const dateRange = eachDayOfInterval({ start: startDate, end: endDate });
      
      // Group current period sales by date
      const salesByDate = new Map();
      currentPeriodSales?.forEach(order => {
        const date = order.order_date;
        if (!salesByDate.has(date)) {
          salesByDate.set(date, 0);
        }
        salesByDate.set(date, salesByDate.get(date) + Number(order.total_amount));
      });

      // Create chart data
      const chartData: SalesData[] = dateRange.map(date => {
        const dateStr = format(date, 'yyyy-MM-dd');
        return {
          date: format(date, 'MMM dd'),
          currentSales: salesByDate.get(dateStr) || 0,
          averageSales: allTimeAverageDailySales,
          yesterdaySales: format(date, 'yyyy-MM-dd') === format(yesterday, 'yyyy-MM-dd') ? yesterdayTotal : 0
        };
      });

      return chartData;
    },
  });

  const totalCurrentSales = salesChartData?.reduce((sum, day) => sum + day.currentSales, 0) || 0;
  const averageCurrentSales = salesChartData?.length ? totalCurrentSales / salesChartData.length : 0;

  return (
    <Card className="bg-white border-2 border-gray-200 shadow-xl">
      <CardHeader className="bg-slate-600 text-white rounded-t-lg">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-3 text-xl">
            <div className="p-2 bg-slate-700 rounded-lg shadow-md">
              <BarChart3 className="h-6 w-6" />
            </div>
            Performance Analytics
          </CardTitle>
          <Select value={selectedMetric} onValueChange={setSelectedMetric}>
            <SelectTrigger className="w-40 bg-white text-gray-900">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sales">Sales Amount</SelectItem>
              <SelectItem value="revenue">Revenue</SelectItem>
              <SelectItem value="orders">Orders Count</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="p-8">
        {/* Sales Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card className="border-2 border-emerald-200 bg-emerald-50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-emerald-700">Current Period Sales</p>
                  <p className="text-2xl font-bold text-emerald-800">₹{totalCurrentSales.toLocaleString()}</p>
                </div>
                <TrendingUp className="h-8 w-8 text-emerald-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-slate-200 bg-slate-50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-700">All-Time Avg Daily</p>
                  <p className="text-2xl font-bold text-slate-800">₹{Math.round(salesChartData?.[0]?.averageSales || 0).toLocaleString()}</p>
                </div>
                <Activity className="h-8 w-8 text-slate-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-indigo-200 bg-indigo-50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-indigo-700">Period Avg Daily</p>
                  <p className="text-2xl font-bold text-indigo-800">₹{Math.round(averageCurrentSales).toLocaleString()}</p>
                </div>
                <BarChart3 className="h-8 w-8 text-indigo-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sales Timeline Chart */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Sales Timeline Comparison</h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={salesChartData}>
                <defs>
                  <linearGradient id="currentSalesGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#059669" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#059669" stopOpacity={0.1}/>
                  </linearGradient>
                  <linearGradient id="averageSalesGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#475569" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#475569" stopOpacity={0.1}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis 
                  dataKey="date" 
                  stroke="#64748b"
                  fontSize={12}
                />
                <YAxis 
                  stroke="#64748b"
                  fontSize={12}
                  tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}K`}
                />
                <Tooltip 
                  formatter={(value: number, name: string) => [
                    `₹${value.toLocaleString()}`,
                    name === 'currentSales' ? 'Current Sales' : 
                    name === 'averageSales' ? 'All-Time Average' : 
                    'Yesterday Sales'
                  ]}
                  labelFormatter={(label) => `Date: ${label}`}
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '2px solid #e2e8f0',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                  }}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="currentSales"
                  stroke="#059669"
                  fillOpacity={1}
                  fill="url(#currentSalesGradient)"
                  strokeWidth={3}
                  name="Current Sales"
                />
                <Line
                  type="monotone"
                  dataKey="averageSales"
                  stroke="#475569"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                  name="All-Time Average"
                />
                <Area
                  type="monotone"
                  dataKey="yesterdaySales"
                  stroke="#4f46e5"
                  fillOpacity={0.3}
                  fill="#4f46e5"
                  strokeWidth={2}
                  name="Yesterday Sales"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Performance Insights */}
        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-semibold text-gray-800 mb-2">Performance Insights</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>
              <span className="text-gray-700">Current period performance vs all-time average</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-slate-500 rounded-full"></div>
              <span className="text-gray-700">Historical average baseline for comparison</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
