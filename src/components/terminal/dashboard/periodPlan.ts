/**
 * TD-FIX-B F5 (+ R1) — Terminal Dashboard period plan as a pure function of one page clock.
 *
 * Live periods (natural end after "now", or a rolling preset) read with stable bounds
 * and are trimmed in the browser with the windows of the page clock, so time changes
 * a read key at most once per IST day (1Y all-day summary: once per half hour).
 * A period chosen while live (or within 24 h of its end) keeps the boundary where it
 * was at its natural end, so its keys never change after the end (R2).
 * Periods chosen more than 24 h after they ended keep exactly the bounds the dashboard
 * used before TD-FIX-B. Dashboard only — Terminal Analytics keeps its own reads.
 */
import {
  TimeFilter, TimeWindow, buildNaturalWindows, buildShiftWindows, getFilterShift,
  getNaturalEnd, getTimestampsForFilter,
} from './TimePeriodFilter';
import { BUCKET_MS, SEALED_WINDOW_MS, getSealedCutoffMs } from '@/lib/sealedSplit';

export { BUCKET_MS, SEALED_WINDOW_MS };
const DAY_MS = 86400000;
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
/** A period that ended less than this ago keeps being re-read (late completions). */
export const RECENTLY_ENDED_MS = 24 * 60 * 60 * 1000;
export const RECENT_REREAD_MS = 60 * 1000;
export const OLDER_REREAD_MS = 30 * 60 * 1000;

/** The 45-day split (one rule: lib/sealedSplit). */
export function sealedCutoffAt(now: number): number {
  return getSealedCutoffMs(now);
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
  /** Recent read (always present) and older read (null when not needed). They may overlap by one IST day. */
  recent: ReadRange;
  older: ReadRange | null;
  /** Window for the chart (hour axis) — follows the clock for live periods. */
  chartWindow: { startTimestamp: number; endTimestamp: number };
};

/** Was the period live, or ended less than 24 h ago, at the moment it was chosen? */
export function scheduledWhenChosen(filter: TimeFilter, chosenAt: number): boolean {
  const end = getNaturalEnd(filter, chosenAt);
  return end === null || chosenAt - end < RECENTLY_ENDED_MS;
}

/**
 * @param now      page clock
 * @param heldSplit 45-day split held from the moment the period was chosen
 * @param chosenAt moment the period (or account) was chosen; defaults to `now`
 */
export function planDashboardPeriod(filter: TimeFilter, now: number, heldSplit: number, chosenAt: number = now): DashboardPeriodPlan {
  const naturalEnd = getNaturalEnd(filter, now);
  const live = naturalEnd === null || naturalEnd > now;
  const scheduled = live || (naturalEnd !== null && now - naturalEnd < RECENTLY_ENDED_MS);
  const shift = getFilterShift(filter);
  const rolling = filter.mode === '7d' || filter.mode === '30d' || filter.mode === '1y';

  if (!scheduledWhenChosen(filter, chosenAt)) {
    // Chosen long after it ended: exactly the previous bounds, windows and split, one read.
    const bounds = getTimestampsForFilter(filter, now);
    const clamped = buildShiftWindows(filter, now);
    const usesSummary = bounds.startTimestamp < heldSplit;
    const readStart = usesSummary ? heldSplit : bounds.startTimestamp;
    return {
      live, naturalEnd, scheduled: false,
      windows: clamped,
      sealedCutoff: heldSplit,
      usesSummary,
      summary: { startTimestamp: bounds.startTimestamp, windows: clamped.map((w) => [w.start, w.end] as [number, number]) },
      recent: { startTimestamp: readStart, endTimestamp: bounds.endTimestamp },
      older: null,
      chartWindow: bounds,
    };
  }

  // The boundary follows the clock while live and stays where it was at the natural end.
  const clock = naturalEnd === null ? now : Math.min(now, naturalEnd - 1);
  const windows = buildNaturalWindows(filter, clock);
  const firstStart = Math.min(...windows.map((w) => w.start));
  // Stable read start: day/range/shift → first window start; 7D/30D all day → IST day start.
  const periodStart = rolling && shift === 'all'
    ? (filter.mode === '1y' ? ceil30(firstStart) : istDayStart(firstStart))
    : firstStart;
  const usesSummary = periodStart < heldSplit;
  const readStart = usesSummary ? heldSplit : periodStart;
  const split = splitRecent(readStart, naturalEnd, clock);

  const summaryWindows: [number, number][] = shift === 'all'
    ? [[periodStart, heldSplit]]
    // A window that starts exactly on the split is kept ([split, split]): the summary's raw part
    // then counts a row created on that very millisecond, which the browser leaves out (R2 · C7).
    : windows.filter((w) => w.start <= heldSplit).map((w) => [w.start, Math.min(w.end, heldSplit)] as [number, number]);

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

/**
 * Recent part = from 00:00 IST yesterday (never before the read start); older part = the rest,
 * overlapping the recent part by one IST day (R1) so that at 00:00 IST, whichever new part
 * lands first, the parts on screen still cover every order (merged by order number).
 */
function splitRecent(readStart: number, readEnd: number | null, clock: number): { recent: ReadRange; older: ReadRange | null } {
  const recentStart = Math.max(readStart, istDayStart(clock) - DAY_MS);
  if (recentStart <= readStart || (readEnd !== null && recentStart > readEnd)) {
    return { recent: { startTimestamp: readStart, endTimestamp: readEnd }, older: null };
  }
  const olderEnd = recentStart + DAY_MS - 1;
  return {
    recent: { startTimestamp: recentStart, endTimestamp: readEnd },
    older: { startTimestamp: readStart, endTimestamp: readEnd === null ? olderEnd : Math.min(olderEnd, readEnd) },
  };
}

/**
 * Browser trim: inside a window, and strictly after the split when the summary covers the rest.
 * R9: only windows that can hold such a row are searched, by binary search over the sorted,
 * non-overlapping windows (same result as scanning every window).
 */
export function makePlanPredicate(plan: DashboardPeriodPlan): (ts: number) => boolean {
  const { usesSummary, sealedCutoff } = plan;
  const ws = plan.windows
    .filter((w) => !usesSummary || w.end > sealedCutoff)
    .slice()
    .sort((a, b) => a.start - b.start);
  const starts = ws.map((w) => w.start);
  const ends = ws.map((w) => w.end);
  const n = ws.length;
  return (ts: number) => {
    if (usesSummary && ts <= sealedCutoff) return false;
    // last window with start <= ts
    let lo = 0, hi = n - 1, idx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (starts[mid] <= ts) { idx = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return idx >= 0 && ts <= ends[idx];
  };
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
