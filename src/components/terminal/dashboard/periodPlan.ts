/**
 * TD-FIX-B F5 — Terminal Dashboard period plan as a pure function of one page clock.
 *
 * Live periods (natural end after "now", or a rolling preset) read with stable bounds
 * and are trimmed in the browser with the windows of the page clock, so time changes
 * a read key at most once per IST day (1Y all-day summary: once per half hour).
 * Fixed periods keep exactly the bounds the dashboard used before this change.
 * Dashboard only — Terminal Analytics keeps its own reads.
 */
import {
  TimeFilter, TimeWindow, buildNaturalWindows, buildShiftWindows, getFilterShift,
  getNaturalEnd, getTimestampsForFilter,
} from './TimePeriodFilter';

export const SEALED_WINDOW_MS = 45 * 24 * 60 * 60 * 1000;
export const BUCKET_MS = 30 * 60 * 1000;
const DAY_MS = 86400000;
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
/** A period that ended less than this ago keeps being re-read (late completions). */
export const RECENTLY_ENDED_MS = 24 * 60 * 60 * 1000;
export const RECENT_REREAD_MS = 60 * 1000;
export const OLDER_REREAD_MS = 30 * 60 * 1000;

/** Same split rule as useOrderSummary.getSealedCutoffMs. */
export function sealedCutoffAt(now: number): number {
  return Math.floor((now - SEALED_WINDOW_MS) / BUCKET_MS) * BUCKET_MS;
}

/** 00:00 IST of the IST day containing ts. */
export function istDayStart(ts: number): number {
  return Math.floor((ts + IST_OFFSET_MS) / DAY_MS) * DAY_MS - IST_OFFSET_MS;
}

const ceil30 = (ts: number) => Math.ceil(ts / BUCKET_MS) * BUCKET_MS;

export type ReadRange = { startTimestamp: number; endTimestamp: number | null };

export type DashboardPeriodPlan = {
  live: boolean;
  /** Natural end (null = rolling preset). */
  naturalEnd: number | null;
  /** Re-read on a schedule (live, or ended < 24 h ago). */
  scheduled: boolean;
  /** Windows used to trim rows (natural ends; Infinity = open). */
  windows: TimeWindow[];
  /** Held 45-day split. */
  sealedCutoff: number;
  usesSummary: boolean;
  /** Summary arguments (only meaningful when usesSummary). */
  summary: { startTimestamp: number; windows: [number, number][] };
  /** Recent read (always present) and older read (null when not needed). */
  recent: ReadRange;
  older: ReadRange | null;
  /** Window for the chart (hour axis) — follows the clock for live periods. */
  chartWindow: { startTimestamp: number; endTimestamp: number };
};

export function planDashboardPeriod(filter: TimeFilter, now: number, heldSplit: number): DashboardPeriodPlan {
  const naturalEnd = getNaturalEnd(filter, now);
  const live = naturalEnd === null || naturalEnd > now;
  const scheduled = live || (naturalEnd !== null && now - naturalEnd < RECENTLY_ENDED_MS);
  const shift = getFilterShift(filter);
  const rolling = filter.mode === '7d' || filter.mode === '30d' || filter.mode === '1y';

  if (!live) {
    // Fixed period: exactly the previous bounds, windows and split.
    const bounds = getTimestampsForFilter(filter, now);
    const clamped = buildShiftWindows(filter, now);
    const usesSummary = bounds.startTimestamp < heldSplit;
    const readStart = usesSummary ? heldSplit : bounds.startTimestamp;
    const readEnd = bounds.endTimestamp;
    const split = scheduled ? splitRecent(readStart, readEnd, now) : { recent: { startTimestamp: readStart, endTimestamp: readEnd }, older: null };
    return {
      live, naturalEnd, scheduled,
      windows: clamped,
      sealedCutoff: heldSplit,
      usesSummary,
      summary: { startTimestamp: bounds.startTimestamp, windows: clamped.map((w) => [w.start, w.end] as [number, number]) },
      ...split,
      chartWindow: bounds,
    };
  }

  const windows = buildNaturalWindows(filter, now);
  const firstStart = Math.min(...windows.map((w) => w.start));
  // Stable read start: day/range/shift → first window start; 7D/30D all day → IST day start.
  const periodStart = rolling && shift === 'all'
    ? (filter.mode === '1y' ? ceil30(firstStart) : istDayStart(firstStart))
    : firstStart;
  const usesSummary = periodStart < heldSplit;
  const readStart = usesSummary ? heldSplit : periodStart;
  const readEnd = naturalEnd; // null = open
  const split = splitRecent(readStart, readEnd, now);

  const summaryWindows: [number, number][] = shift === 'all'
    ? [[periodStart, heldSplit]]
    : windows.filter((w) => w.start < heldSplit).map((w) => [w.start, Math.min(w.end, heldSplit)] as [number, number]);

  const started = windows.filter((w) => w.start <= now);
  const chartStart = started.length ? Math.min(...started.map((w) => w.start)) : now;
  const chartEnd = started.length ? Math.min(now, Math.max(...started.map((w) => w.end))) : now;
  return {
    live, naturalEnd, scheduled, windows,
    sealedCutoff: heldSplit,
    usesSummary,
    summary: { startTimestamp: periodStart, windows: summaryWindows },
    ...split,
    chartWindow: { startTimestamp: chartStart, endTimestamp: chartEnd },
  };
}

/** Recent part = from 00:00 IST yesterday (never before the read start); older part = the rest. */
function splitRecent(readStart: number, readEnd: number | null, now: number): { recent: ReadRange; older: ReadRange | null } {
  const recentStart = Math.max(readStart, istDayStart(now) - DAY_MS);
  if (readEnd !== null && recentStart > readEnd) {
    return { recent: { startTimestamp: readStart, endTimestamp: readEnd }, older: null };
  }
  return {
    recent: { startTimestamp: recentStart, endTimestamp: readEnd },
    older: recentStart > readStart ? { startTimestamp: readStart, endTimestamp: recentStart - 1 } : null,
  };
}

/** Browser trim: inside a window, and strictly after the split when the summary covers the rest. */
export function makePlanPredicate(plan: DashboardPeriodPlan): (ts: number) => boolean {
  const { windows, usesSummary, sealedCutoff } = plan;
  return (ts: number) => (!usesSummary || ts > sealedCutoff) && windows.some((w) => ts >= w.start && ts <= w.end);
}

/** Query keys (for tests and the hooks). */
export function readKey(r: ReadRange): string { return `${r.startTimestamp}|${r.endTimestamp ?? 'open'}`; }
export function summaryKey(plan: DashboardPeriodPlan): string | null {
  return plan.usesSummary ? `${plan.summary.startTimestamp}|${plan.sealedCutoff}|${JSON.stringify(plan.summary.windows)}` : null;
}

/** "Updating…" only when the shown rows belong to a different user choice (period/account). */
export function isUserChangePending(settledKey: string | null, userKey: string, placeholder: boolean): boolean {
  return placeholder && settledKey !== userKey;
}
