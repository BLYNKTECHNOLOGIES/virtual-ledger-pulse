import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ChartSkeleton } from "@/components/shared/skeletons";
import { EmptyState } from "@/components/shared/EmptyState";
import { BarChart3, TrendingUp, RefreshCw, AlertTriangle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { resolveCarriedPurchaseRate } from "@/lib/carryForwardPurchaseRate";
import { format, subDays } from "date-fns";
import { AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, LineChart, ReferenceLine } from "recharts";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Panel,
  TablePager,
  usePaged,
  ChartTooltipBox,
  axisProps,
  gridProps,
  axisInr,
  useChartPalette,
  formatCompactINR,
  formatExactINR,
} from "@/components/finance-ui";

type ViewMode = "day" | "month";

export function GrossProfitHistoryTab() {
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const queryClient = useQueryClient();
  const palette = useChartPalette();

  const { data: historyData, isLoading } = useQuery({
    queryKey: ["daily_gross_profit_history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_gross_profit_history")
        .select("snapshot_date, gross_profit, total_sales_qty, avg_sales_rate, effective_purchase_rate, purchase_rate_carried, purchase_rate_source_date")
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
      const sales = await fetchAllPaginated<any>(() => supabase
        .from("sales_orders")
        .select("quantity, price_per_unit, effective_usdt_qty, effective_usdt_rate")
        .eq("status", "COMPLETED")
        .eq("order_date", todayStr));

      const totalSalesQty = sales?.reduce((s, o) => s + (Number(o.effective_usdt_qty || o.quantity) || 0), 0) || 0;
      const totalSalesValue = sales?.reduce((s, o) => {
        const qty = Number(o.effective_usdt_qty || o.quantity) || 0;
        const rate = Number(o.effective_usdt_rate || o.price_per_unit) || 0;
        return s + (qty * rate);
      }, 0) || 0;
      const avgSalesRate = totalSalesQty > 0 ? totalSalesValue / totalSalesQty : 0;

      // Purchases — use effective_usdt_qty from purchase_orders directly
      const purchases = await fetchAllPaginated<any>(() => supabase
        .from("purchase_orders")
        .select("id, total_amount, effective_usdt_qty")
        .eq("status", "COMPLETED")
        .eq("order_date", todayStr));

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

      // No purchases today → carry forward the last purchase day's effective rate,
      // otherwise the entire sale value would be booked as profit.
      let effectivePurchaseRate = totalPurchaseQty > 0 ? totalPurchaseValue / totalPurchaseQty : 0;
      let carried: { rate: number; sourceDate: string } | null = null;
      if (totalPurchaseQty <= 0) {
        carried = await resolveCarriedPurchaseRate(todayStr, 'all');
        effectivePurchaseRate = carried?.rate ?? 0;
      }

      const costBasisUnavailable = effectivePurchaseRate <= 0;
      const npm = costBasisUnavailable ? 0 : avgSalesRate - effectivePurchaseRate;
      const grossProfit = costBasisUnavailable ? 0 : npm * totalSalesQty;

      return {
        snapshot_date: todayStr,
        gross_profit: grossProfit,
        total_sales_qty: totalSalesQty,
        avg_sales_rate: avgSalesRate,
        effective_purchase_rate: effectivePurchaseRate,
        purchase_rate_carried: !!carried,
        purchase_rate_source_date: carried?.sourceDate ?? null,
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

  // NPM outliers to exclude from the trend line (kept in table/gross profit, only NPM line skips)
  const NPM_OUTLIER_DATES = new Set<string>(["2026-05-27", "2026-06-22"]);
  // Gross Profit outliers to exclude from the chart scale (kept in table)
  const GP_OUTLIER_DATES = new Set<string>(["2026-05-27"]);

  const chartData = useMemo(() => {
    if (!mergedData?.length) return [];

    if (viewMode === "day") {
      return mergedData.map((item) => {
        const npm = Number(item.avg_sales_rate) - Number(item.effective_purchase_rate);
        const isNpmOutlier = NPM_OUTLIER_DATES.has(item.snapshot_date);
        const isGpOutlier = GP_OUTLIER_DATES.has(item.snapshot_date);
        return {
          date: format(new Date(item.snapshot_date), "dd MMM yyyy"),
          value: isGpOutlier ? null : Number(item.gross_profit),
          npm: isNpmOutlier || Number(item.total_sales_qty) <= 0 ? null : npm,
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
      const isNpmOutlier = NPM_OUTLIER_DATES.has(item.snapshot_date);
      const isGpOutlier = GP_OUTLIER_DATES.has(item.snapshot_date);
      if (!isGpOutlier) existing.profit += Number(item.gross_profit);
      if (hasSales && !isNpmOutlier) {
        existing.totalNpm += npm;
        existing.days += 1;
      }
      monthMap.set(monthKey, existing);
    }
    return Array.from(monthMap.entries()).map(([key, v]) => ({
      date: format(new Date(key + "-01"), "MMM yyyy"),
      value: v.profit,
      npm: v.days > 0 ? v.totalNpm / v.days : null,
    }));
  }, [mergedData, viewMode]);


  const formatCurrency = (value: number) =>
    `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

  const latestValue = mergedData?.length
    ? Number(mergedData[mergedData.length - 1].gross_profit)
    : 0;

  const previousValue = mergedData && mergedData.length >= 2
    ? Number(mergedData[mergedData.length - 2].gross_profit)
    : 0;

  const changePercent = previousValue !== 0
    ? (((latestValue - previousValue) / Math.abs(previousValue)) * 100).toFixed(2)
    : "0.00";

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

  // Display-only rollups for the summary strip.
  const last30 = useMemo(() => {
    const cutoff = format(subDays(new Date(), 29), "yyyy-MM-dd");
    const rows = (mergedData || []).filter((r) => r.snapshot_date >= cutoff);
    const total = rows.reduce((s, r) => s + Number(r.gross_profit || 0), 0);
    const qty = rows.reduce((s, r) => s + Number(r.total_sales_qty || 0), 0);
    return { total, perUnit: qty > 0 ? total / qty : null, days: rows.length };
  }, [mergedData]);

  const tableRows = useMemo(() => {
    if (viewMode === "day") {
      return [...(mergedData || [])].reverse().map((item: any) => ({
        key: item.snapshot_date,
        date: format(new Date(item.snapshot_date), "dd MMM yyyy"),
        carried: !!item.purchase_rate_carried,
        source: item.purchase_rate_source_date as string | null,
        live: item.snapshot_date === todayStr && todayLive && item === todayLive,
        qty: Number(item.total_sales_qty),
        npm: Number(item.avg_sales_rate) - Number(item.effective_purchase_rate),
        gp: Number(item.gross_profit),
      }));
    }
    return [...chartData].reverse().map((item: any) => ({
      key: item.date, date: item.date, carried: false, source: null, live: false,
      qty: null as number | null, npm: item.npm as number | null, gp: Number(item.value),
    }));
  }, [viewMode, mergedData, chartData, todayStr, todayLive]);
  const pager = usePaged(tableRows, 15, viewMode);

  const changeNum = Number(changePercent);

  return (
    <Panel
      icon={BarChart3}
      title="Gross profit history"
      description="Daily snapshots, with today's figure computed live"
      actions={
        <SegmentedControl
          size="sm"
          aria-label="History granularity"
          value={viewMode}
          onValueChange={(v) => setViewMode(v as ViewMode)}
          options={[{ value: "day", label: "Day" }, { value: "month", label: "Month" }]}
        />
      }
    >
      {/* Sync bar if gap detected */}
      {hasGap && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-warning/30 bg-warning/10 px-3 py-2">
          <span className="flex items-center gap-2 text-sm text-foreground">
            <AlertTriangle className="h-4 w-4 text-warning" />
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
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-md border border-border/70 p-3">
          <p className="t-label">Latest day</p>
          <p className={cn("mt-1 text-xl font-semibold tracking-tight", latestValue >= 0 ? "text-success" : "text-destructive")} title={formatExactINR(latestValue)}>
            {formatCurrency(latestValue)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{latestDate}</p>
        </div>
        <div className="rounded-md border border-border/70 p-3">
          <p className="t-label">Change</p>
          <p className={cn("mt-1 text-xl font-semibold tracking-tight", changeNum > 0 ? "text-success" : changeNum < 0 ? "text-destructive" : "text-foreground")}>
            {changeNum >= 0 ? "+" : ""}{changePercent}%
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">vs previous snapshot</p>
        </div>
        <div className="rounded-md border border-border/70 p-3">
          <p className="t-label">Last 30 days</p>
          <p className={cn("mt-1 text-xl font-semibold tracking-tight", last30.total >= 0 ? "text-foreground" : "text-destructive")} title={formatExactINR(last30.total)}>
            {formatCompactINR(last30.total)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {last30.perUnit != null ? `₹${last30.perUnit.toFixed(2)} per unit sold` : "No sales"} · {last30.days} days
          </p>
        </div>
        <div className="rounded-md border border-border/70 p-3">
          <p className="t-label">Total snapshots</p>
          <p className="mt-1 text-xl font-semibold tracking-tight text-foreground">{mergedData?.length || 0}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Daily records</p>
        </div>
      </div>

      {/* Charts — gross profit and NPM on separate scales */}
      <div className="mt-5">
        {isLoading ? (
          <ChartSkeleton height={300} />
        ) : chartData.length === 0 ? (
          <EmptyState icon={TrendingUp} title="No historical data yet" description="Daily snapshots will appear here starting from tomorrow at 12:00 AM" />
        ) : (
          <div className="space-y-4">
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Gross profit {viewMode === "day" ? "per day" : "per month"}</p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  {viewMode === "day" ? (
                    <AreaChart data={chartData} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid {...gridProps} />
                      <XAxis dataKey="date" {...axisProps} minTickGap={36} tickFormatter={(d: string) => d.slice(0, 6)} />
                      <YAxis {...axisProps} width={56} tickFormatter={axisInr} />
                      <ReferenceLine y={0} stroke="hsl(var(--border))" />
                      <Tooltip
                        cursor={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1 }}
                        content={({ active, payload, label }) => active && payload?.length ? (
                          <ChartTooltipBox title={label} rows={[{ key: "gp", label: "Gross profit", value: payload[0].value == null ? "Outlier hidden" : formatCurrency(Number(payload[0].value)), color: palette.positive }]} />
                        ) : null}
                      />
                      <Area type="monotone" dataKey="value" stroke={palette.positive} fill={palette.positive} fillOpacity={0.1} strokeWidth={2} connectNulls dot={false} activeDot={{ r: 4 }} />
                    </AreaChart>
                  ) : (
                    <BarChart data={chartData} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid {...gridProps} />
                      <XAxis dataKey="date" {...axisProps} />
                      <YAxis {...axisProps} width={56} tickFormatter={axisInr} />
                      <ReferenceLine y={0} stroke="hsl(var(--border))" />
                      <Tooltip
                        cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }}
                        content={({ active, payload, label }) => active && payload?.length ? (
                          <ChartTooltipBox title={label} rows={[{ key: "gp", label: "Gross profit", value: formatCurrency(Number(payload[0].value)), color: palette.positive }]} />
                        ) : null}
                      />
                      <Bar dataKey="value" maxBarSize={24} radius={[4, 4, 0, 0]}>
                        {chartData.map((d: any, i: number) => (
                          <Cell key={i} fill={Number(d.value) >= 0 ? palette.positive : palette.negative} />
                        ))}
                      </Bar>
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">NPM (₹ per unit) {viewMode === "month" ? "— average of trading days" : ""}</p>
              <div className="h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="date" {...axisProps} minTickGap={36} tickFormatter={(d: string) => (viewMode === "day" ? d.slice(0, 6) : d)} />
                    <YAxis {...axisProps} width={56} tickFormatter={(v) => `₹${Number(v).toFixed(1)}`} domain={["auto", "auto"]} />
                    <Tooltip
                      cursor={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1 }}
                      content={({ active, payload, label }) => active && payload?.length ? (
                        <ChartTooltipBox title={label} rows={[{ key: "npm", label: "NPM (per unit)", value: payload[0].value == null ? "—" : `₹${Number(payload[0].value).toFixed(2)}`, color: palette.s1 }]} />
                      ) : null}
                    />
                    <Line type="monotone" dataKey="npm" stroke={palette.s1} strokeWidth={2} dot={viewMode === "month" ? { r: 4, fill: palette.s1, stroke: "hsl(var(--card))", strokeWidth: 2 } : false} activeDot={{ r: 4 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tabular Data */}
      {chartData.length > 0 && (
        <div className="mt-5">
          <p className="t-label mb-2">{viewMode === "day" ? "Daily" : "Monthly"} breakdown · newest first</p>
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Total Sales Qty (USDT equiv.)</TableHead>
                <TableHead className="text-right">Margin (₹/unit)</TableHead>
                <TableHead className="text-right">Gross Profit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pager.slice.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className="text-sm">
                    {row.date}
                    {row.live && <span className="ml-2 ds-status ds-status-info">Live</span>}
                    {row.carried && (
                      <span
                        className="ml-2 text-xs text-muted-foreground"
                        title={`No purchases that day — cost basis carried forward from ${row.source}`}
                      >
                        carried fwd
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm font-mono text-[13px] tabular-nums">{row.qty == null ? "—" : row.qty.toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell>
                  <TableCell className="text-right text-sm font-mono text-[13px] tabular-nums">{row.npm == null ? "—" : `₹${Number(row.npm).toFixed(2)}`}</TableCell>
                  <TableCell className={`text-right text-sm font-semibold tabular-nums ${row.gp >= 0 ? 'text-success' : 'text-destructive'}`}>
                    ₹{row.gp.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePager {...pager} noun={viewMode === "day" ? "days" : "months"} />
        </div>
      )}
    </Panel>
  );
}
