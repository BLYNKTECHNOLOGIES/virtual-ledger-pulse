import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart3, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, ComposedChart, Legend } from "recharts";

type ViewMode = "day" | "month";

export function GrossProfitHistoryTab() {
  const [viewMode, setViewMode] = useState<ViewMode>("day");

  const { data: historyData, isLoading } = useQuery({
    queryKey: ["daily_gross_profit_history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_gross_profit_history")
        .select("snapshot_date, gross_profit, total_sales_qty, avg_sales_rate, effective_purchase_rate")
        .order("snapshot_date", { ascending: true })
        .limit(1000);
      if (error) throw error;
      return data || [];
    },
  });

  const chartData = useMemo(() => {
    if (!historyData?.length) return [];

    if (viewMode === "day") {
      return historyData.map((item) => {
        const npm = Number(item.avg_sales_rate) - Number(item.effective_purchase_rate);
        return {
          date: format(new Date(item.snapshot_date), "dd MMM yyyy"),
          value: Number(item.gross_profit),
          npm: Number(item.total_sales_qty) > 0 ? npm : 0,
        };
      });
    }

    // Month aggregation
    const monthMap = new Map<string, { profit: number; totalNpm: number; days: number }>();
    for (const item of historyData) {
      const monthKey = format(new Date(item.snapshot_date), "yyyy-MM");
      const existing = monthMap.get(monthKey) || { profit: 0, totalNpm: 0, days: 0 };
      const npm = Number(item.avg_sales_rate) - Number(item.effective_purchase_rate);
      const hasSales = Number(item.total_sales_qty) > 0;
      existing.profit += Number(item.gross_profit);
      if (hasSales) {
        existing.totalNpm += npm;
        existing.days += 1;
      }
      monthMap.set(monthKey, existing);
    }
    return Array.from(monthMap.entries()).map(([key, v]) => ({
      date: format(new Date(key + "-01"), "MMM yyyy"),
      value: v.profit,
      npm: v.days > 0 ? v.totalNpm / v.days : 0,
    }));
  }, [historyData, viewMode]);

  const formatCurrency = (value: number) =>
    `₹${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  const latestValue = historyData?.length
    ? Number(historyData[historyData.length - 1].gross_profit)
    : 0;

  const previousValue = historyData && historyData.length >= 2
    ? Number(historyData[historyData.length - 2].gross_profit)
    : 0;

  const changePercent = previousValue !== 0
    ? (((latestValue - previousValue) / Math.abs(previousValue)) * 100).toFixed(2)
    : "0.00";

  const isPositive = latestValue >= 0;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className={`${isPositive ? 'bg-gradient-to-br from-emerald-600 to-green-700' : 'bg-gradient-to-br from-red-600 to-rose-700'} text-white border-0`}>
          <CardContent className="p-6">
            <p className="text-white/80 text-sm font-medium">Latest Day's Gross Profit</p>
            <p className="text-2xl font-bold mt-2">{formatCurrency(latestValue)}</p>
            <p className="text-sm mt-1 text-white/80">
              {historyData?.length
                ? format(new Date(historyData[historyData.length - 1].snapshot_date), "dd MMM yyyy")
                : "No data yet"}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white border-0">
          <CardContent className="p-6">
            <p className="text-blue-200 text-sm font-medium">Change</p>
            <p className="text-2xl font-bold mt-2">
              {Number(changePercent) >= 0 ? "+" : ""}{changePercent}%
            </p>
            <p className="text-sm mt-1 text-blue-200">vs previous snapshot</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-slate-600 to-gray-700 text-white border-0">
          <CardContent className="p-6">
            <p className="text-slate-200 text-sm font-medium">Total Snapshots</p>
            <p className="text-2xl font-bold mt-2">{historyData?.length || 0}</p>
            <p className="text-sm mt-1 text-slate-200">Daily records</p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card className="bg-white dark:bg-card border-2 border-gray-200 dark:border-border shadow-xl">
        <CardHeader className="bg-emerald-600 text-white rounded-t-lg">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-3 text-xl text-white">
              <div className="p-2 bg-emerald-700 rounded-lg shadow-md">
                <BarChart3 className="h-6 w-6" />
              </div>
              Gross Profit Trend
            </CardTitle>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={viewMode === "day" ? "secondary" : "ghost"}
                className={viewMode === "day" ? "bg-white text-emerald-700" : "text-white hover:bg-emerald-500"}
                onClick={() => setViewMode("day")}
              >
                Day
              </Button>
              <Button
                size="sm"
                variant={viewMode === "month" ? "secondary" : "ghost"}
                className={viewMode === "month" ? "bg-white text-emerald-700" : "text-white hover:bg-emerald-500"}
                onClick={() => setViewMode("month")}
              >
                Month
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {isLoading ? (
            <div className="h-72 flex items-center justify-center text-muted-foreground">
              Loading chart data...
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-72 flex flex-col items-center justify-center text-muted-foreground">
              <TrendingUp className="h-12 w-12 mb-4 opacity-50" />
              <p className="font-medium">No historical data yet</p>
              <p className="text-sm">Daily snapshots will appear here starting from tomorrow at 12:00 AM</p>
            </div>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    angle={-30}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis
                    yAxisId="left"
                    tickFormatter={(v) => `₹${(v / 1000).toFixed(1)}K`}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickFormatter={(v) => `₹${Number(v).toFixed(1)}`}
                    tick={{ fontSize: 11 }}
                    label={{ value: "NPM (₹/unit)", angle: 90, position: "insideRight", style: { fontSize: 10, fill: "#6366f1" } }}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      name === "npm" ? `₹${Number(value).toFixed(2)}` : formatCurrency(value),
                      name === "npm" ? "NPM (per unit)" : "Gross Profit"
                    ]}
                    labelStyle={{ fontWeight: "bold" }}
                  />
                  <Legend
                    formatter={(value) => value === "npm" ? "NPM (per unit)" : "Gross Profit"}
                  />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="value"
                    name="value"
                    stroke="#059669"
                    fill="#059669"
                    fillOpacity={0.15}
                    strokeWidth={2}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="npm"
                    name="npm"
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={{ r: 4, fill: "#6366f1" }}
                    activeDot={{ r: 6 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
