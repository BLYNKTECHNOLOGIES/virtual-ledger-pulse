/**
 * Pre-computed order summary helpers.
 *
 * Orders older than the "sealed" cutoff (45 days) can never change status, so
 * their totals are pre-aggregated in `terminal_order_rollups` and read back via
 * the `get_terminal_order_summary` function. This module turns those rows into
 * exactly the same shapes the dashboard already renders, so long windows
 * (1 year, wide custom ranges) no longer require every browser to download tens
 * of thousands of raw orders.
 */

export type OrderSummaryRow = {
  day_ist: string;
  trade_type: string;
  status_group: string;
  asset: string;
  order_count: number;
  fiat_volume: number;
  asset_qty: number;
  commission: number;
  appeal_count: number;
  source: string;
};

export type SummaryAggregate = {
  totalOrders: number;
  completedCount: number;
  cancelledCount: number;
  expiredCount: number;
  buyCount: number;
  sellCount: number;
  totalBuyVolume: number;
  totalSellVolume: number;
  appeals: number;
  /** Chart-ready daily series (completed orders only), oldest first. */
  series: { day: string; date: string; dateKey: number; buy: number; sell: number }[];
  /** Status label -> count, using the same labels as OrderStatusBreakdown. */
  statusCounts: Record<string, number>;
};

const STATUS_LABEL: Record<string, string> = {
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  AUTO_CANCELLED: 'Auto-Cancelled',
  EXPIRED: 'Expired',
  OTHER: 'Trading',
};

export const EMPTY_SUMMARY: SummaryAggregate = {
  totalOrders: 0,
  completedCount: 0,
  cancelledCount: 0,
  expiredCount: 0,
  buyCount: 0,
  sellCount: 0,
  totalBuyVolume: 0,
  totalSellVolume: 0,
  appeals: 0,
  series: [],
  statusCounts: {},
};

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** TD-FIX-B F6 — the IST calendar date of a timestamp as 'YYYY-MM-DD', whatever the browser's time zone. */
export function istDayKey(ts: number): string {
  return new Date(ts + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Sortable number for a 'YYYY-MM-DD' day (UTC midnight of that date; time-zone independent). */
export function dayKeyToMs(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}

/** Axis label: "28 Oct", or "28 Oct 25" when the chart spans more than a year. */
export function formatDayLabel(day: string, withYear: boolean): string {
  return new Date(dayKeyToMs(day)).toLocaleDateString('en-GB', withYear
    ? { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' }
    : { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** Tooltip date with the year: "15 Nov 2025". */
export function formatDayFull(day: string): string {
  return new Date(dayKeyToMs(day)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function aggregateSummaryRows(rows: OrderSummaryRow[]): SummaryAggregate {
  const out: SummaryAggregate = {
    ...EMPTY_SUMMARY,
    series: [],
    statusCounts: {},
  };
  // One point per real IST day (year included), keyed by day_ist.
  const byDay = new Map<string, { day: string; date: string; dateKey: number; buy: number; sell: number }>();

  for (const r of rows) {
    const count = Number(r.order_count) || 0;
    const volume = Number(r.fiat_volume) || 0;
    const isBuy = (r.trade_type || '').toUpperCase() === 'BUY';

    out.totalOrders += count;
    // TD-FIX-B-R1 R6: only the non-final group can hold an open appeal (same rule as isActiveAppealOrder).
    if (r.status_group === 'OTHER') out.appeals += Number(r.appeal_count) || 0;

    const label = STATUS_LABEL[r.status_group] || r.status_group;
    out.statusCounts[label] = (out.statusCounts[label] || 0) + count;

    if (r.status_group === 'COMPLETED') {
      out.completedCount += count;
      if (isBuy) {
        out.buyCount += count;
        out.totalBuyVolume += volume;
      } else {
        out.sellCount += count;
        out.totalSellVolume += volume;
      }
      const day = String(r.day_ist).slice(0, 10);
      const entry = byDay.get(day) || { day, date: formatDayLabel(day, false), dateKey: dayKeyToMs(day), buy: 0, sell: 0 };
      if (isBuy) entry.buy += volume;
      else entry.sell += volume;
      byDay.set(day, entry);
    } else if (r.status_group === 'CANCELLED' || r.status_group === 'AUTO_CANCELLED') {
      out.cancelledCount += count;
    } else if (r.status_group === 'EXPIRED') {
      out.expiredCount += count;
    }
  }

  out.series = Array.from(byDay.values()).sort((a, b) => a.dateKey - b.dateKey);
  return out;
}

type BaseStats = {
  activeOrders: number;
  awaitingPayment: number;
  awaitingRelease: number;
  pendingPayments: number;
  completedInPeriod: number;
  completedToday: number;
  appeals: number;
  totalBuyVolume: number;
  totalSellVolume: number;
  totalVolume: number;
  avgOrderSize: number;
  completionRate: number;
  buySellRatio: string;
  completedCount: number;
  cancelledCount: number;
  expiredCount: number;
};

/**
 * Merge live-tail stats (computed from raw orders) with the pre-computed totals
 * of the sealed part of the window. Derived figures are recomputed from the
 * combined counts so they stay identical to the all-raw calculation.
 */
export function mergeStatsWithSummary(base: BaseStats, agg: SummaryAggregate): BaseStats {
  const completedCount = base.completedCount + agg.completedCount;
  const cancelledCount = base.cancelledCount + agg.cancelledCount;
  const expiredCount = base.expiredCount + agg.expiredCount;
  const totalBuyVolume = base.totalBuyVolume + agg.totalBuyVolume;
  const totalSellVolume = base.totalSellVolume + agg.totalSellVolume;
  const totalVolume = totalBuyVolume + totalSellVolume;
  const finalStateTotal = completedCount + cancelledCount + expiredCount;

  const [baseBuy, baseSell] = base.buySellRatio.split('/').map((v) => Number(v.trim()) || 0);

  return {
    ...base,
    completedCount,
    cancelledCount,
    expiredCount,
    totalBuyVolume,
    totalSellVolume,
    totalVolume,
    avgOrderSize: completedCount > 0 ? totalVolume / completedCount : 0,
    completionRate: finalStateTotal > 0 ? (completedCount / finalStateTotal) * 100 : 0,
    buySellRatio: `${baseBuy + agg.buyCount} / ${baseSell + agg.sellCount}`,
    completedInPeriod: base.completedInPeriod + agg.completedCount,
    completedToday: base.completedToday + agg.completedCount,
    appeals: base.appeals + agg.appeals,
  };
}
