import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart3, TrendingUp, RefreshCw } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, ComposedChart, Legend } from "recharts";
import { toast } from "sonner";

type ViewMode = "day" | "month";

export function GrossProfitHistoryTab() {
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const queryClient = useQueryClient();

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

  // Compute today's profit live from sales/purchase data
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const { data: todayLive } = useQuery({
    queryKey: ["daily_gross_profit_live", todayStr],
    queryFn: async () => {
      // Sales — use effective USDT fields for normalized comparison
      const { data: sales } = await supabase
        .from("sales_orders")
        .select("quantity, price_per_unit, effective_usdt_qty, effective_usdt_rate")
        .eq("status", "COMPLETED")
        .eq("order_date", todayStr);

      const totalSalesQty = sales?.reduce((s, o) => s + (Number(o.effective_usdt_qty || o.quantity) || 0), 0) || 0;
      const totalSalesValue = sales?.reduce((s, o) => {
        const qty = Number(o.effective_usdt_qty || o.quantity) || 0;
        const rate = Number(o.effective_usdt_rate || o.price_per_unit) || 0;
        return s + (qty * rate);
      }, 0) || 0;
      const avgSalesRate = totalSalesQty > 0 ? totalSalesValue / totalSalesQty : 0;

      // Purchases — use effective_usdt_qty from purchase_orders directly
      const { data: purchases } = await supabase
        .from("purchase_orders")
        .select("id, total_amount, effective_usdt_qty")
        .eq("status", "COMPLETED")
        .eq("order_date", todayStr);

      let totalPurchaseValue = 0;
      let totalPurchaseQty = 0;
      for (const po of purchases || []) {
        const effQty = Number(po.effective_usdt_qty) || 0;
        const totalAmt = Number(po.total_amount) || 0;
        if (effQty > 0) {
          totalPurchaseQty += effQty;
          totalPurchaseValue += totalAmt;
        }
      }

      const effectivePurchaseRate = totalPurchaseQty > 0 ? totalPurchaseValue / totalPurchaseQty : 0;
      const npm = avgSalesRate - effectivePurchaseRate;
      const grossProfit = npm * totalSalesQty;

      return {
        snapshot_date: todayStr,
        gross_profit: grossProfit,
        total_sales_qty: totalSalesQty,
        avg_sales_rate: avgSalesRate,
        effective_purchase_rate: effectivePurchaseRate,
      };
    },
    refetchInterval: 60000, // refresh every minute
  });

  // Merge history + today's live data
  const mergedData = useMemo(() => {
    const history = historyData || [];
    if (!todayLive || todayLive.total_sales_qty === 0) return history;
    // If today already exists in history, replace it; otherwise append
    const filtered = history.filter(h => h.snapshot_date !== todayStr);
    return [...filtered, todayLive];
  }, [historyData, todayLive, todayStr]);

  // Sync/backfill mutation
  const syncMutation = useMutation({
    mutationFn: async () => {
      // Find last snapshot date
      const lastDate = historyData?.length
        ? historyData[historyData.length - 1].snapshot_date
        : format(new Date(Date.now() - 30 * 86400000), "yyyy-MM-dd");

      // Backfill from day after last snapshot to today
      const nextDay = new Date(lastDate);
      nextDay.setDate(nextDay.getDate() + 1);
      const fromStr = format(nextDay, "yyyy-MM-dd");

      const response = await supabase.functions.invoke('snapshot-daily-profit', {
        body: { backfill_from: fromStr, backfill_to: todayStr },
      });
      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["daily_gross_profit_history"] });
      toast.success(`Synced ${data?.backfilled || 0} daily snapshots`);
    },
    onError: (err: any) => {
      toast.error("Sync failed: " + (err?.message || "Unknown error"));
    },
  });

  const chartData = useMemo(() => {
    if (!mergedData?.length) return [];

    if (viewMode === "day") {
      return mergedData.map((item) => {
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
    for (const item of mergedData) {
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
  }, [mergedData, viewMode]);

  const formatCurrency = (value: number) =>
    `₹${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  const latestValue = mergedData?.length
    ? Number(mergedData[mergedData.length - 1].gross_profit)
    : 0;

  const previousValue = mergedData && mergedData.length >= 2
    ? Number(mergedData[mergedData.length - 2].gross_profit)
    : 0;

  const changePercent = previousValue !== 0
    ? (((latestValue - previousValue) / Math.abs(previousValue)) * 100).toFixed(2)
    : "0.00";

  const isPositive = latestValue >= 0;

  const latestDate = mergedData?.length
    ? format(new Date(mergedData[mergedData.length - 1].snapshot_date), "dd MMM yyyy")
    : "No data yet";

  // Check if there's a gap
  const hasGap = useMemo(() => {
    if (!historyData?.length) return false;
    const lastSnapshot = historyData[historyData.length - 1].snapshot_date;
    const yesterday = format(new Date(Date.now() - 86400000), "yyyy-MM-dd");
    return lastSnapshot < yesterday;
  }, [historyData]);

  return (
    <div className="space-y-6">
      {/* Sync bar if gap detected */}
      {hasGap && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-3 flex items-center justify-between">
            <span className="text-sm text-amber-700">
              Missing snapshots detected. Click sync to backfill missing dates.
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              className="gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
              {syncMutation.isPending ? "Syncing..." : "Sync Now"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className={`${isPositive ? 'bg-gradient-to-br from-emerald-600 to-green-700' : 'bg-gradient-to-br from-red-600 to-rose-700'} text-white border-0`}>
          <CardContent className="p-6">
            <p className="text-white/80 text-sm font-medium">Latest Day's Gross Profit</p>
            <p className="text-2xl font-bold mt-2">{formatCurrency(latestValue)}</p>
            <p className="text-sm mt-1 text-white/80">{latestDate}</p>
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
            <p className="text-2xl font-bold mt-2">{mergedData?.length || 0}</p>
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

      {/* Tabular Data */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {viewMode === "day" ? "Daily" : "Monthly"} Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Total Sales Qty (USDT equiv.)</TableHead>
                    <TableHead className="text-right">Margin (₹/unit)</TableHead>
                    <TableHead className="text-right">Gross Profit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(viewMode === "day" ? mergedData || [] : []).map((item: any) => {
                    const npm = Number(item.avg_sales_rate) - Number(item.effective_purchase_rate);
                    return (
                      <TableRow key={item.snapshot_date}>
                        <TableCell className="text-sm">{format(new Date(item.snapshot_date), "dd MMM yyyy")}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{Number(item.total_sales_qty).toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell>
                        <TableCell className="text-right font-mono text-sm">₹{npm.toFixed(2)}</TableCell>
                        <TableCell className={`text-right font-mono text-sm font-semibold ${Number(item.gross_profit) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ₹{Number(item.gross_profit).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {viewMode === "month" && chartData.map((item: any) => (
                    <TableRow key={item.date}>
                      <TableCell className="text-sm">{item.date}</TableCell>
                      <TableCell className="text-right font-mono text-sm">—</TableCell>
                      <TableCell className="text-right font-mono text-sm">₹{Number(item.npm).toFixed(2)}</TableCell>
                      <TableCell className={`text-right font-mono text-sm font-semibold ${item.value >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ₹{Number(item.value).toLocaleString(undefined, { maximumFractionDigits: 2 })}
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
