import { useState, useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ChartSkeleton } from "@/components/shared/skeletons";
import { EmptyState } from "@/components/shared/EmptyState";
import { BarChart3, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays } from "date-fns";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import {
  Panel,
  DeltaChip,
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
type AssetSnapshot = { snapshot_date: string; total_asset_value: number };

/** Daily total-asset-value snapshots (shared by this tab and the Financials header). */
export function useAssetValueHistory() {
  return useQuery({
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
}

/**
 * Drop single-day spikes >50% vs the last accepted point — almost always
 * snapshot errors that wreck the chart scale. Table data stays untouched.
 */
export function cleanAssetHistory<T extends AssetSnapshot>(historyData?: T[] | null) {
  if (!historyData?.length) return { cleanedHistory: [] as T[], excludedCount: 0 };
  const kept: T[] = [];
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
}

export function AssetValueHistoryTab() {
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const palette = useChartPalette();

  const { data: historyData, isLoading } = useAssetValueHistory();

  const { cleanedHistory, excludedCount } = useMemo(() => cleanAssetHistory(historyData), [historyData]);

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

  // Display-only: change against the snapshot on or before 7 / 30 days ago (outliers excluded).
  const changeVs = useMemo(() => {
    const out: { d7: number | null; d30: number | null; v7: number | null; v30: number | null } = { d7: null, d30: null, v7: null, v30: null };
    if (!cleanedHistory.length || !historyData?.length) return out;
    const lastDate = historyData[historyData.length - 1].snapshot_date;
    const pickOnOrBefore = (days: number) => {
      const cutoff = format(subDays(new Date(lastDate), days), "yyyy-MM-dd");
      let found: number | null = null;
      for (const r of cleanedHistory) { if (r.snapshot_date <= cutoff) found = Number(r.total_asset_value); else break; }
      return found;
    };
    out.v7 = pickOnOrBefore(7);
    out.v30 = pickOnOrBefore(30);
    if (out.v7) out.d7 = ((latestValue - out.v7) / out.v7) * 100;
    if (out.v30) out.d30 = ((latestValue - out.v30) / out.v30) * 100;
    return out;
  }, [cleanedHistory, historyData, latestValue]);

  const tableRows = useMemo(() => [...chartData].reverse(), [chartData]);
  const pager = usePaged(tableRows, 15, viewMode);
  const changeNum = Number(changePercent);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-xs)]">
          <p className="t-label">Latest Asset Value</p>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground" title={formatExactINR(latestValue)}>{formatCompactINR(latestValue)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
            {formatCurrency(latestValue)} · {historyData?.length
              ? format(new Date(historyData[historyData.length - 1].snapshot_date), "dd MMM yyyy")
              : "No data yet"}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-xs)]">
          <p className="t-label">Change</p>
          <p className={cn("mt-1.5 text-2xl font-semibold tracking-tight", changeNum > 0 ? "text-success" : changeNum < 0 ? "text-destructive" : "text-foreground")}>
            {changeNum >= 0 ? "+" : ""}{changePercent}%
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">vs previous snapshot</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-xs)]">
          <p className="t-label">Last 7 days</p>
          <div className="mt-2"><DeltaChip value={changeVs.d7} /></div>
          <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">{changeVs.v7 ? `from ${formatCompactINR(changeVs.v7)}` : "Not enough history"}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-xs)]">
          <p className="t-label">Last 30 days</p>
          <div className="mt-2"><DeltaChip value={changeVs.d30} /></div>
          <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">{changeVs.v30 ? `from ${formatCompactINR(changeVs.v30)}` : "Not enough history"} · {historyData?.length || 0} daily records</p>
        </div>
      </div>

      {/* Chart */}
      <Panel
        icon={BarChart3}
        title="Asset Value Trend"
        description={excludedCount > 0
          ? `${excludedCount} outlier ${excludedCount === 1 ? "point" : "points"} hidden (>50% single-day swing)`
          : "Total asset value from the daily snapshots"}
        actions={
          <SegmentedControl
            size="sm"
            aria-label="Granularity"
            value={viewMode}
            onValueChange={(v) => setViewMode(v as ViewMode)}
            options={[{ value: "day", label: "Day" }, { value: "month", label: "Month" }]}
          />
        }
      >
        {isLoading ? (
          <ChartSkeleton height={260} />
        ) : chartData.length === 0 ? (
          <EmptyState icon={TrendingUp} title="No historical data yet" description="Daily snapshots will appear here starting from tomorrow at 12:00 AM" />
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="date" {...axisProps} minTickGap={36} tickFormatter={(d: string) => (viewMode === "day" ? d.slice(0, 6) : d)} />
                <YAxis {...axisProps} width={60} tickFormatter={axisInr} />
                <Tooltip
                  cursor={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1 }}
                  content={({ active, payload, label }) => active && payload?.length ? (
                    <ChartTooltipBox title={label} rows={[{ key: "v", label: "Asset Value", value: formatCurrency(Number(payload[0].value)), color: palette.s1 }]} />
                  ) : null}
                />
                <Area type="monotone" dataKey="value" stroke={palette.s1} fill={palette.s1} fillOpacity={0.1} strokeWidth={2} dot={viewMode === "month" ? { r: 4, fill: palette.s1, stroke: "hsl(var(--card))", strokeWidth: 2 } : false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>

      {/* Tabular Data */}
      {chartData.length > 0 && (
        <Panel title={`${viewMode === "day" ? "Daily" : "Monthly"} Asset Value Breakdown`} description="Newest first">
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Total Asset Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pager.slice.map((item) => (
                <TableRow key={item.date}>
                  <TableCell className="text-sm">{item.date}</TableCell>
                  <TableCell className="text-right text-sm font-semibold font-mono text-[13px] tabular-nums">
                    {formatCurrency(item.value)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePager {...pager} noun={viewMode === "day" ? "days" : "months"} />
        </Panel>
      )}
    </div>
  );
}
