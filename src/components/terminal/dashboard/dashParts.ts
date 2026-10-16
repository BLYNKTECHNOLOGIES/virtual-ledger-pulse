/**
 * TD-FIX-B-R1/R2 — pure parts of the dashboard reads (no React rendering, no Supabase), so
 * tests can drive them with real QueryObservers: the page clock (R3), the combine step
 * (R1/R4/R8) and how the page reads the combined state (R2: first load, user change, re-runs).
 */
import { keepPreviousData } from '@tanstack/react-query';
import type { ReadRange } from './periodPlan';

/**
 * R3 — the page clock, without React or a DOM: it advances only while the tab is visible
 * (60 s ticks and read-landed bumps are ignored while hidden), and once on becoming visible.
 */
export function createDashboardClock(isVisible: () => boolean, getNow: () => number, onChange: (now: number) => void) {
  let current = getNow();
  const advance = () => { current = getNow(); onChange(current); };
  return {
    get now() { return current; },
    /** 60 s tick, or a read that landed. */
    tick() { if (isVisible()) advance(); },
    /** visibilitychange */
    visibilityChanged() { if (isVisible()) advance(); },
  };
}

/** The dashboard's read options for one part, minus the fetcher (tests use the same options). */
export function dashboardReadOptionsBase(accountsKey: string, accountsCount: number, range: ReadRange | null, scheduled: boolean, interval: number) {
  return {
    // Prefix 'cached-order-history' so sync success / Universal sync invalidations reach it.
    queryKey: ['cached-order-history', 'dashboard', accountsKey, range?.startTimestamp ?? null, range?.endTimestamp ?? null] as const,
    enabled: !!range && accountsCount > 0,
    staleTime: scheduled ? interval : 2 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    placeholderData: keepPreviousData,
    refetchInterval: scheduled ? interval : (false as const),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: scheduled,
  };
}

/** What the combine step needs from one part's query result. */
export type PartState = {
  data?: unknown[] | undefined;
  isLoading: boolean;
  isPlaceholderData: boolean;
  isError: boolean;
  isFetching: boolean;
  dataUpdatedAt: number;
  /** When the part last failed (0 or missing = never). */
  errorUpdatedAt?: number;
  /** TanStack status and fetchStatus; a read waiting for the network is 'paused', not fetching. */
  status?: 'pending' | 'error' | 'success';
  fetchStatus?: 'fetching' | 'paused' | 'idle';
};

/** R2 · F1 — the part's read is in progress: fetching, or paused while the device is offline. */
export function partRunning(p: PartState): boolean {
  return p.fetchStatus !== undefined ? p.fetchStatus !== 'idle' : p.isFetching;
}

/** The part has no rows of its own for its key (not even placeholder rows) and its read is in progress. */
export function partReading(p: PartState): boolean {
  return p.status !== undefined ? p.status === 'pending' && partRunning(p) : p.isLoading;
}

/**
 * R2 · C2 — a part counts as failed while it is in error, and also while it runs again after a
 * failure: a query with no rows that fetches again is reported as pending (error cleared), not
 * as error, so `isError` alone turns false for the length of the re-run.
 */
export function partFailed(p: PartState): boolean {
  return p.isError || (partRunning(p) && (p.errorUpdatedAt ?? 0) > p.dataUpdatedAt);
}

export type CombinedFlags = {
  /** No part has any rows to show (shimmer). */
  isLoading: boolean;
  /** Some part has no rows of its own yet and is reading (first read for its key, or a re-run after a failure). */
  partial: boolean;
  /** Some part shows the rows of a previous key while its new key is read. */
  isPlaceholderData: boolean;
  /** Some part failed, or is running again after a failure. */
  isError: boolean;
  isFetching: boolean;
  dataUpdatedAt: number;
  lastReadAt: number;
  failed: { recent: boolean; older: boolean };
  /** A part that failed is running again (Retry busy, R8). */
  retryBusy: boolean;
};

export type CombinedParts = CombinedFlags & { data: any[] };

const rowKey = (r: any) => (r && (r.orderNumber ?? r.order_number)) as string | undefined;

/**
 * R1 — the rows of the two parts, merged by order number (the table's primary key; the recent
 * copy wins), so the one-day overlap never counts an order twice. Also drops a row repeated
 * within one part (offset paging while new orders arrive). Depends on the rows only.
 */
export function mergePartRows(recentData: unknown[] | undefined, olderData: unknown[] | undefined): any[] {
  const seen = new Set<string>();
  const data: any[] = [];
  for (const rows of [recentData ?? [], olderData ?? []]) {
    for (const r of rows as any[]) {
      const k = rowKey(r);
      if (k !== undefined) { if (seen.has(k)) continue; seen.add(k); }
      data.push(r);
    }
  }
  return data;
}

/** R1/R4/R8 — loading, placeholder and failure flags of the parts (cheap; no rows touched). */
export function combinePartFlags(recent: PartState, older: PartState | null): CombinedFlags {
  const parts = older ? [recent, older] : [recent];
  const failed = { recent: partFailed(recent), older: !!older && partFailed(older) };
  const anyRows = parts.some((p) => p.data !== undefined);
  return {
    isLoading: !anyRows && parts.some(partReading),
    partial: parts.some(partReading),
    isPlaceholderData: parts.some((p) => p.isPlaceholderData),
    isError: failed.recent || failed.older,
    isFetching: parts.some((p) => p.isFetching),
    dataUpdatedAt: Math.min(...parts.map((p) => p.dataUpdatedAt)),
    lastReadAt: Math.max(...parts.map((p) => p.dataUpdatedAt)),
    failed,
    retryBusy: parts.some((p) => partRunning(p) && partFailed(p)),
  };
}

/** Rows and flags together (tests). The page memoises the rows on the parts' data only. */
export function combineDashboardParts(recent: PartState, older: PartState | null): CombinedParts {
  return { data: mergePartRows(recent.data, older ? older.data : undefined), ...combinePartFlags(recent, older) };
}

/**
 * R2 · C1 — how the page reads the combined order-history state. `settledKey` is the choice
 * (period + account) whose parts last all landed or failed; null until that first happens.
 * - First load, or a part re-running after a failure: shimmer until every part has rows, as
 *   before TD-FIX-B-R1 — partial figures are never shown as final.
 * - After a user change: the previous choice's rows stay, dimmed with "Updating…", until every
 *   part of the new choice has landed (R4); the page shimmers when none of them fit the new period.
 * - Time-driven key changes: silent; R1 keeps every order exactly once while the new reads land.
 */
export function readPeriodState(
  flags: Pick<CombinedFlags, 'isLoading' | 'partial' | 'isPlaceholderData'>,
  settledKey: string | null,
  userKey: string,
): { loading: boolean; placeholder: boolean; settled: boolean } {
  const busy = flags.isPlaceholderData || flags.partial;
  const userChange = busy && settledKey !== null && settledKey !== userKey;
  return {
    loading: flags.isLoading || (flags.partial && !userChange),
    placeholder: userChange,
    settled: !busy,
  };
}

/** R8 — Retry re-runs only the part(s) that failed and are not already running again. */
export function retryFailedParts(
  recent: PartState & { refetch: () => unknown },
  older: (PartState & { refetch: () => unknown }) | null,
) {
  if (partFailed(recent) && !partRunning(recent)) recent.refetch();
  if (older && partFailed(older) && !partRunning(older)) older.refetch();
}
