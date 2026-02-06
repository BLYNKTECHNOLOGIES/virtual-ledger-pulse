import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart3, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

type ViewMode = "day" | "month";

export function AssetValueHistoryTab() {
  const [viewMode, setViewMode] = useState<ViewMode>("day");

  const { data: historyData, isLoading } = useQuery({
    queryKey: ["asset_value_history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("asset_value_history")
        .select("snapshot_date, total_asset_value")
        .order("snapshot_date", { ascending: true })
        .limit(1000);
      if (error) throw error;
      return data || [];
    },
  });

  const chartData = useMemo(() => {
    if (!historyData?.length) return [];

    if (viewMode === "day") {
      return historyData.map((item) => ({
        date: format(new Date(item.snapshot_date), "dd MMM yyyy"),
        value: Number(item.total_asset_value),
      }));
    }

    // Month aggregation - use last value of each month
    const monthMap = new Map<string, number>();
    for (const item of historyData) {
      const monthKey = format(new Date(item.snapshot_date), "yyyy-MM");
      monthMap.set(monthKey, Number(item.total_asset_value));
    }
    return Array.from(monthMap.entries()).map(([key, value]) => ({
      date: format(new Date(key + "-01"), "MMM yyyy"),
      value,
    }));
  }, [historyData, viewMode]);

  const formatCurrency = (value: number) =>
    `₹${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  const latestValue = historyData?.length
    ? Number(historyData[historyData.length - 1].total_asset_value)
    : 0;

  const previousValue = historyData && historyData.length >= 2
    ? Number(historyData[historyData.length - 2].total_asset_value)
    : 0;

  const changePercent = previousValue > 0
    ? (((latestValue - previousValue) / previousValue) * 100).toFixed(2)
    : "0.00";

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-indigo-600 to-purple-700 text-white border-0">
          <CardContent className="p-6">
            <p className="text-indigo-200 text-sm font-medium">Latest Asset Value</p>
            <p className="text-2xl font-bold mt-2">{formatCurrency(latestValue)}</p>
            <p className="text-sm mt-1 text-indigo-200">
              {historyData?.length
                ? format(new Date(historyData[historyData.length - 1].snapshot_date), "dd MMM yyyy")
                : "No data yet"}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-500 to-green-600 text-white border-0">
          <CardContent className="p-6">
            <p className="text-emerald-200 text-sm font-medium">Change</p>
            <p className="text-2xl font-bold mt-2">
              {Number(changePercent) >= 0 ? "+" : ""}{changePercent}%
            </p>
            <p className="text-sm mt-1 text-emerald-200">vs previous snapshot</p>
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
      <Card className="bg-white border-2 border-gray-200 shadow-xl">
        <CardHeader className="bg-indigo-600 text-white rounded-t-lg">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-3 text-xl">
              <div className="p-2 bg-indigo-700 rounded-lg shadow-md">
                <BarChart3 className="h-6 w-6" />
              </div>
              Asset Value Trend
            </CardTitle>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={viewMode === "day" ? "secondary" : "ghost"}
                className={viewMode === "day" ? "bg-white text-indigo-700" : "text-white hover:bg-indigo-500"}
                onClick={() => setViewMode("day")}
              >
                Day
              </Button>
              <Button
                size="sm"
                variant={viewMode === "month" ? "secondary" : "ghost"}
                className={viewMode === "month" ? "bg-white text-indigo-700" : "text-white hover:bg-indigo-500"}
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
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    angle={-30}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis
                    tickFormatter={(v) => `₹${(v / 100000).toFixed(1)}L`}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip
                    formatter={(value: number) => [formatCurrency(value), "Asset Value"]}
                    labelStyle={{ fontWeight: "bold" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#4f46e5"
                    fill="#4f46e5"
                    fillOpacity={0.15}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
