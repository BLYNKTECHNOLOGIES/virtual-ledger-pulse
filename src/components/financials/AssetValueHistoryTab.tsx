import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

  // Drop single-day spikes >50% vs the last accepted point — almost always
  // snapshot errors that wreck the chart scale. Table data stays untouched.
  const { cleanedHistory, excludedCount } = useMemo(() => {
    if (!historyData?.length) return { cleanedHistory: [], excludedCount: 0 };
    const kept: typeof historyData = [];
    let lastAccepted: number | null = null;
    let excluded = 0;
    for (const item of historyData) {
      const value = Number(item.total_asset_value);
      if (lastAccepted !== null && lastAccepted > 0) {
        const change = Math.abs(value - lastAccepted) / lastAccepted;
        if (change > 0.5) {
          excluded += 1;
          continue;
        }
      }
      kept.push(item);
      lastAccepted = value;
    }
    return { cleanedHistory: kept, excludedCount: excluded };
  }, [historyData]);

  const chartData = useMemo(() => {
    if (!cleanedHistory.length) return [];

    if (viewMode === "day") {
      return cleanedHistory.map((item) => ({
        date: format(new Date(item.snapshot_date), "dd MMM yyyy"),
        value: Number(item.total_asset_value),
      }));
    }

    // Month aggregation — closing value per month, but guarded by the month's
    // median so a bad last-day snapshot can't distort the monthly scale.
    const monthMap = new Map<string, number[]>();
    for (const item of cleanedHistory) {
      const monthKey = format(new Date(item.snapshot_date), "yyyy-MM");
      const bucket = monthMap.get(monthKey) ?? [];
      bucket.push(Number(item.total_asset_value));
      monthMap.set(monthKey, bucket);
    }
    return Array.from(monthMap.entries()).map(([key, values]) => {
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median =
        sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
      const closing = values[values.length - 1];
      const robust =
        median > 0 && Math.abs(closing - median) / median > 0.5 ? median : closing;
      return {
        date: format(new Date(key + "-01"), "MMM yyyy"),
        value: robust,
      };
    });
  }, [cleanedHistory, viewMode]);



  const formatCurrency = (value: number) =>
    `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

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
        <Card className="bg-gradient-to-br from-primary to-primary text-primary-foreground border-0">
          <CardContent className="p-6">
            <p className="text-primary-foreground/80 text-sm font-medium">Latest Asset Value</p>
            <p className="text-2xl font-bold mt-2">{formatCurrency(latestValue)}</p>
            <p className="text-sm mt-1 text-primary-foreground/75">
              {historyData?.length
                ? format(new Date(historyData[historyData.length - 1].snapshot_date), "dd MMM yyyy")
                : "No data yet"}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-success to-success text-primary-foreground border-0">
          <CardContent className="p-6">
            <p className="text-primary-foreground/80 text-sm font-medium">Change</p>
            <p className="text-2xl font-bold mt-2">
              {Number(changePercent) >= 0 ? "+" : ""}{changePercent}%
            </p>
            <p className="text-sm mt-1 text-primary-foreground/75">vs previous snapshot</p>
          </CardContent>
        </Card>

        <Card className="bg-muted text-foreground border-0">
          <CardContent className="p-6">
            <p className="text-muted-foreground text-sm font-medium">Total Snapshots</p>
            <p className="text-2xl font-bold mt-2">{historyData?.length || 0}</p>
            <p className="text-sm mt-1 text-muted-foreground">Daily records</p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card className="bg-card border border-border shadow-sm">
        <CardHeader className="border-b border-border">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="p-2 bg-muted rounded-lg">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </span>
                Asset Value Trend
              </CardTitle>
              {excludedCount > 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  {excludedCount} outlier {excludedCount === 1 ? "point" : "points"} hidden (&gt;50% single-day swing)
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={viewMode === "day" ? "default" : "outline"}
                onClick={() => setViewMode("day")}
              >
                Day
              </Button>
              <Button
                size="sm"
                variant={viewMode === "month" ? "default" : "outline"}
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

      {/* Tabular Data */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {viewMode === "day" ? "Daily" : "Monthly"} Asset Value Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Total Asset Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {chartData.map((item) => (
                    <TableRow key={item.date}>
                      <TableCell className="text-sm">{item.date}</TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold">
                        {formatCurrency(item.value)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
