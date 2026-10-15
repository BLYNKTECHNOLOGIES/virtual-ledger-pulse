import { memo, useMemo, useState } from 'react';
import { Activity } from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { C2COrderHistoryItem } from '@/hooks/useBinanceOrders';
import { TimePeriod } from './TimePeriodFilter';
import { dayKeyToMs, formatDayFull, formatDayLabel, istDayKey } from '@/lib/orderSummary';
import { formatAxisRupees, formatExactRupees, formatIstDay, formatIstHour, formatIstTime, istHourStart } from './dashFormat';

interface Props {
  orders: C2COrderHistoryItem[];
  isLoading: boolean;
  period: TimePeriod;
  /** Pre-computed daily totals for the sealed (older than 45 days) part of the window. */
  precomputedSeries?: { day: string; date: string; dateKey: number; buy: number; sell: number }[];
  /** Window of a single selected day (IST). When set, volume is plotted per hour. */
  hourWindow?: { startTimestamp: number; endTimestamp: number };
  /** The selected range is longer than a year: axis labels carry a two-digit year. */
  yearLabels?: boolean;
  /** Order history could not be read for the period. */
  unavailable?: boolean;
}

type Point = { date: string; full: string; buy: number; sell: number };

const HOUR_MS = 3600000;


const tooltipStyle = {
  backgroundColor: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 8,
  fontSize: 12,
  color: 'hsl(var(--foreground))',
};

/** Hour labels every 1, 2, 3, 4, 6 or 12 hours, whichever fits the plot width. */
function hourTicks(points: Point[], plotWidth: number): string[] {
  const slots = plotWidth > 0 ? Math.max(2, Math.floor((plotWidth - 60) / 44)) : 8;
  const step = [1, 2, 3, 4, 6, 12].find((s) => Math.ceil(points.length / s) <= slots) || 12;
  return points.map((p) => p.date).filter((label) => Number(label.slice(0, 2)) % step === 0);
}

function TradeVolumeChartPanel({ orders, isLoading, precomputedSeries, hourWindow, yearLabels = false, unavailable }: Props) {
  const [plotWidth, setPlotWidth] = useState(0);

  const { chartData, totalBuy, totalSell, hourly } = useMemo(() => {
    const pre = precomputedSeries || [];
    if (!orders.length && !pre.length) return { chartData: [] as Point[], totalBuy: 0, totalSell: 0, hourly: false };

    const completed = orders.filter(o => (o.orderStatus || '').toUpperCase().includes('COMPLETED'));
    let totalBuy = 0, totalSell = 0;
    for (const p of pre) { totalBuy += p.buy; totalSell += p.sell; }
    for (const o of completed) {
      const price = parseFloat(o.totalPrice || '0');
      if (o.tradeType === 'BUY') totalBuy += price;
      else totalSell += price;
    }

    // One selected day with raw orders only: one point per IST hour of the window,
    // empty hours included, so the day reads as a timeline.
    if (hourWindow && pre.length === 0) {
      if (!completed.length) return { chartData: [] as Point[], totalBuy: 0, totalSell: 0, hourly: true };
      const buckets = new Map<number, { buy: number; sell: number }>();
      const first = istHourStart(hourWindow.startTimestamp);
      const last = istHourStart(Math.max(hourWindow.startTimestamp, hourWindow.endTimestamp - 1));
      for (let t = first; t <= last; t += HOUR_MS) buckets.set(t, { buy: 0, sell: 0 });
      for (const o of completed) {
        const key = istHourStart(o.createTime);
        const entry = buckets.get(key) || { buy: 0, sell: 0 };
        const price = parseFloat(o.totalPrice || '0');
        if (o.tradeType === 'BUY') entry.buy += price;
        else entry.sell += price;
        buckets.set(key, entry);
      }
      const chartData = Array.from(buckets.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([t, v]) => {
          // A bucket cut by the window (shift start, or now) shows the minutes it covers.
          const from = Math.max(t, hourWindow.startTimestamp);
          const to = Math.min(t + HOUR_MS, hourWindow.endTimestamp);
          return {
            date: formatIstHour(t),
            full: `${formatIstDay(from)}, ${formatIstTime(from)}–${to === t + HOUR_MS ? formatIstHour(to) : formatIstTime(to)}`,
            buy: Math.round(v.buy),
            sell: Math.round(v.sell),
          };
        });
      return { chartData, totalBuy: Math.round(totalBuy), totalSell: Math.round(totalSell), hourly: true };
    }

    // TD-FIX-B F6: one point per real IST day ('YYYY-MM-DD', year included), the same key
    // for pre-computed days and raw orders, whatever the browser's time zone.
    const byDay = new Map<string, { buy: number; sell: number }>();
    for (const p of pre) {
      const entry = byDay.get(p.day) || { buy: 0, sell: 0 };
      entry.buy += p.buy; entry.sell += p.sell;
      byDay.set(p.day, entry);
    }
    for (const o of completed) {
      const day = istDayKey(o.createTime);
      const entry = byDay.get(day) || { buy: 0, sell: 0 };
      const price = parseFloat(o.totalPrice || '0');
      if (o.tradeType === 'BUY') entry.buy += price;
      else entry.sell += price;
      byDay.set(day, entry);
    }
    const days = Array.from(byDay.keys()).sort((a, b) => dayKeyToMs(a) - dayKeyToMs(b));
    const withYear = yearLabels;
    const chartData = days.map((day) => {
      const v = byDay.get(day)!;
      return { date: formatDayLabel(day, withYear), full: formatDayFull(day), buy: Math.round(v.buy), sell: Math.round(v.sell) };
    });
    return { chartData, totalBuy: Math.round(totalBuy), totalSell: Math.round(totalSell), hourly: false };
  }, [orders, precomputedSeries, hourWindow, yearLabels]);

  // Bars for hours and for very short day ranges (an area needs at least a few points).
  const asBars = hourly || chartData.length <= 2;
  const ticks = hourly ? hourTicks(chartData, plotWidth) : undefined;
  // One unit for the whole axis, chosen from the largest bar or point.
  const yMax = chartData.reduce((m, d) => Math.max(m, d.buy, d.sell), 0);
  const fullLabel = (label: unknown, payload: ReadonlyArray<{ payload?: Point }>) => payload?.[0]?.payload?.full || String(label);
  const formatValue = (value: unknown, name: unknown): [string, string] => [formatExactRupees(Number(value)), name === 'buy' ? 'Buy volume' : 'Sell volume'];
  const xAxis = (
    <XAxis
      dataKey="date"
      tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
      axisLine={false}
      tickLine={false}
      {...(ticks ? { ticks, interval: 0 as const } : { minTickGap: 12, interval: 'preserveStartEnd' as const })}
    />
  );
  const yAxis = (
    <YAxis
      tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
      axisLine={false}
      tickLine={false}
      width={52}
      tickFormatter={(v) => formatAxisRupees(Number(v), yMax)}
    />
  );
  const grid = <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />;
  const tooltip = (
    <Tooltip
      contentStyle={tooltipStyle}
      labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
      cursor={{ fill: 'hsl(var(--muted-foreground) / 0.08)' }}
      labelFormatter={fullLabel}
      formatter={formatValue}
    />
  );

  const ready = !isLoading && !unavailable && chartData.length > 0;

  return (
    <div className="@container t-panel flex h-full flex-col">
      {/* Panel head: wraps on narrow panels so the colour key and totals always stay visible */}
      <div className="flex min-h-9 flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-3 py-1.5">
        <Activity className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        <span className="t-panel-head-title">Trade volume</span>
        {ready && (
          <span className="text-[10px] text-muted-foreground">
            · completed, {hourly ? 'by hour' : 'by day'}
          </span>
        )}
        {ready && (
          <div className="flex basis-full flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] t-mono @[30rem]:ml-auto @[30rem]:basis-auto">
            <span className="flex items-center gap-1.5" title="Completed buy volume in the period">
              <span className="h-2 w-2 rounded-full bg-trade-buy" aria-hidden="true" />
              <span className="text-muted-foreground">Buy</span>
              <span className="text-foreground">{formatExactRupees(totalBuy)}</span>
            </span>
            <span className="flex items-center gap-1.5" title="Completed sell volume in the period">
              <span className="h-2 w-2 rounded-full bg-trade-sell" aria-hidden="true" />
              <span className="text-muted-foreground">Sell</span>
              <span className="text-foreground">{formatExactRupees(totalSell)}</span>
            </span>
          </div>
        )}
      </div>
      <div className="flex-1 p-3">
        {isLoading ? (
          <div className="t-shimmer h-56 w-full rounded-md" />
        ) : unavailable ? (
          <div className="flex h-56 flex-col items-center justify-center gap-2 text-center">
            <Activity className="h-7 w-7 text-muted-foreground/40" aria-hidden="true" />
            <div className="text-xs font-medium text-foreground">Order history couldn't be loaded</div>
            <div className="text-[11px] text-muted-foreground">Use Retry at the top of the page.</div>
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-56 flex-col items-center justify-center gap-2 text-center">
            <Activity className="h-7 w-7 text-muted-foreground/40" aria-hidden="true" />
            <div className="text-xs font-medium text-foreground">No completed trades in this period</div>
            <div className="text-[11px] text-muted-foreground">Volume appears here once orders complete.</div>
          </div>
        ) : (
          <>
          <div
            className="h-56"
            role="img"
            aria-label={`Completed volume ${hourly ? 'by hour' : 'by day'}: buy ${formatExactRupees(totalBuy)}, sell ${formatExactRupees(totalSell)}`}
          >
            <ResponsiveContainer width="100%" height="100%" onResize={(w) => setPlotWidth(Math.round(w))}>
              {asBars ? (
                <BarChart data={chartData} margin={{ top: 8, right: 4, left: -6, bottom: 0 }} barGap={2} barCategoryGap={hourly ? '22%' : '35%'}>
                  {grid}
                  {xAxis}
                  {yAxis}
                  {tooltip}
                  <Bar dataKey="buy" fill="hsl(var(--trade-buy))" radius={[2, 2, 0, 0]} maxBarSize={18} />
                  <Bar dataKey="sell" fill="hsl(var(--trade-sell))" radius={[2, 2, 0, 0]} maxBarSize={18} />
                </BarChart>
              ) : (
                <AreaChart data={chartData} margin={{ top: 8, right: 4, left: -6, bottom: 0 }}>
                  <defs>
                    <linearGradient id="buyGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--trade-buy))" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="hsl(var(--trade-buy))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="sellGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--trade-sell))" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="hsl(var(--trade-sell))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  {grid}
                  {xAxis}
                  {yAxis}
                  {tooltip}
                  <Area type="monotone" dataKey="buy" stroke="hsl(var(--trade-buy))" fill="url(#buyGrad)" strokeWidth={2} dot={false} activeDot={{ r: 3, strokeWidth: 0 }} />
                  <Area type="monotone" dataKey="sell" stroke="hsl(var(--trade-sell))" fill="url(#sellGrad)" strokeWidth={2} dot={false} activeDot={{ r: 3, strokeWidth: 0 }} />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>
          </>
        )}
      </div>
    </div>
  );
}

// Memoised: the page re-renders on every live-orders poll; this panel only when its own props change.
export const TradeVolumeChart = memo(TradeVolumeChartPanel);
