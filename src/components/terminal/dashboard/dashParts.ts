/**
 * TD-FIX-B-R1 — pure parts of the dashboard reads (no React, no Supabase), so tests can
 * drive them with real QueryObservers: the page clock (R3), the combine step (R1/R4/R8).
 */
import { keepPreviousData } from '@tanstack/query-core';
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
};

export type CombinedParts = {
  data: any[];
  /** Nothing to show yet: no part has any rows (shimmer). */
  isLoading: boolean;
  /** Rows on screen are not yet those of the current keys for every part. */
  isPlaceholderData: boolean;
  isError: boolean;
  isFetching: boolean;
  dataUpdatedAt: number;
  lastReadAt: number;
  failed: { recent: boolean; older: boolean };
  /** A part that failed is running again (Retry busy, R8). */
  retryBusy: boolean;
};

const rowKey = (r: any) => (r && (r.orderNumber ?? r.order_number)) as string | undefined;

/**
 * R1/R4/R8 — combine the recent and older parts. Rows are merged by order number (the
 * table's primary key; recent row wins), so the one-day overlap never counts an order twice.
 * A part read for the first time (no rows of its own yet) while the other part shows rows
 * counts as placeholder ("Updating…"), not loading.
 */
export function combineDashboardParts(recent: PartState, older: PartState | null): CombinedParts {
  const parts = older ? [recent, older] : [recent];
  const seen = new Set<string>();
  const data: any[] = [];
  for (const p of parts) {
    for (const r of (p.data ?? []) as any[]) {
      const k = rowKey(r);
      if (k !== undefined) { if (seen.has(k)) continue; seen.add(k); }
      data.push(r);
    }
  }
  const anyRows = parts.some((p) => p.data !== undefined);
  const anyLoading = parts.some((p) => p.isLoading);
  const anyPlaceholder = parts.some((p) => p.isPlaceholderData);
  const failed = { recent: recent.isError, older: !!older && older.isError };
  return {
    data,
    isLoading: anyLoading && !anyRows,
    isPlaceholderData: anyPlaceholder || (anyLoading && anyRows),
    isError: failed.recent || failed.older,
    isFetching: parts.some((p) => p.isFetching),
    dataUpdatedAt: Math.min(...parts.map((p) => p.dataUpdatedAt)),
    lastReadAt: Math.max(...parts.map((p) => p.dataUpdatedAt)),
    failed,
    retryBusy: parts.some((p) => p.isError && p.isFetching),
  };
}

/** R8 — Retry re-runs only the part(s) that failed. */
export function retryFailedParts(recent: { isError: boolean; refetch: () => unknown }, older: { isError: boolean; refetch: () => unknown } | null) {
  if (recent.isError) recent.refetch();
  if (older && older.isError) older.refetch();
}

