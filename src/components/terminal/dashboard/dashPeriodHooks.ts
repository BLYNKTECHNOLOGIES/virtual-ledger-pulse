/**
 * TD-FIX-B F5 (+ R1/R3/R4/R8) — dashboard-only hooks: one page clock, the scheduled
 * order-history reads (recent every 60 s, older every 30 min, visible tab only), and a
 * refreshed sync-status read for the pill. Terminal Analytics does not use these.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useExchangeAccount } from '@/contexts/ExchangeAccountContext';
import { fetchCachedOrderRows, fetchSyncMetadata } from '@/hooks/useBinanceOrderSync';
import { isUserChangePending } from './periodPlan';
import { DashboardPeriodPlan, OLDER_REREAD_MS, RECENT_REREAD_MS, ReadRange } from './periodPlan';

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

/** "Now" for every period calculation: advances every 60 s and on bump() while visible, and on tab show. */
export function useDashboardClock(): [number, () => void] {
  const [now, setNow] = useState(() => Date.now());
  const clockRef = useRef<ReturnType<typeof createDashboardClock> | null>(null);
  if (!clockRef.current) {
    clockRef.current = createDashboardClock(
      () => typeof document === 'undefined' || document.visibilityState === 'visible',
      () => Date.now(),
      setNow,
    );
  }
  useEffect(() => {
    const clock = clockRef.current!;
    const id = setInterval(() => clock.tick(), 60_000);
    const onVis = () => clock.visibilityChanged();
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, []);
  const bumpRef = useRef(() => clockRef.current!.tick());
  return [now, bumpRef.current];
}

/** The dashboard's read options for one part (exported so tests use the same options). */
export function dashboardReadOptions(accountsKey: string, accounts: string[], range: ReadRange | null, scheduled: boolean, interval: number) {
  return {
    // Prefix 'cached-order-history' so sync success / Universal sync invalidations reach it.
    queryKey: ['cached-order-history', 'dashboard', accountsKey, range?.startTimestamp ?? null, range?.endTimestamp ?? null] as const,
    enabled: !!range && accounts.length > 0,
    queryFn: () => fetchCachedOrderRows(accounts, range!.startTimestamp, range!.endTimestamp),
    staleTime: scheduled ? interval : 2 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    placeholderData: keepPreviousData,
    refetchInterval: scheduled ? interval : (false as const),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: scheduled,
  };
}

function useRead(range: ReadRange | null, scheduled: boolean, interval: number) {
  const { accountsToQuery } = useExchangeAccount();
  return useQuery(dashboardReadOptions(accountsToQuery.join(','), accountsToQuery, range, scheduled, interval));
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

export function useDashboardOrders(plan: DashboardPeriodPlan) {
  const recent = useRead(plan.recent, plan.scheduled, RECENT_REREAD_MS);
  const older = useRead(plan.older, plan.scheduled, OLDER_REREAD_MS);
  const hasOlder = !!plan.older;
  const combined = useMemo(
    () => combineDashboardParts(recent as PartState, hasOlder ? (older as PartState) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recent.data, recent.isLoading, recent.isPlaceholderData, recent.isError, recent.isFetching, recent.dataUpdatedAt,
      older.data, older.isLoading, older.isPlaceholderData, older.isError, older.isFetching, older.dataUpdatedAt, hasOlder],
  );
  return {
    ...combined,
    /** Universal sync: refresh every part. */
    refetch: () => { recent.refetch(); if (hasOlder) older.refetch(); },
    /** Retry (R8): only the part(s) that failed. */
    refetchFailed: () => retryFailedParts(recent, hasOlder ? older : null),
  };
}

/** Sync status for the pill, on the recent-read schedule, under its own key. */
export function useDashboardSyncMetadata() {
  return useQuery({
    queryKey: ['binance-sync-metadata', 'dashboard-pill'],
    queryFn: fetchSyncMetadata,
    staleTime: RECENT_REREAD_MS,
    refetchInterval: RECENT_REREAD_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

/**
 * Placeholder rows count as "Updating…" only after a user change (period/account),
 * never after a time-driven key change: keep the old rows and trim them instead.
 */
export function useUserChangePending(userKey: string, placeholder: boolean): boolean {
  const [settledKey, setSettledKey] = useState<string | null>(null);
  useEffect(() => { if (!placeholder) setSettledKey(userKey); }, [placeholder, userKey]);
  return isUserChangePending(settledKey, userKey, placeholder);
}
