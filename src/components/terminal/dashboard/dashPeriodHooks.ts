/**
 * TD-FIX-B F5 (+ R1/R3/R4/R8, R2) — dashboard-only hooks: one page clock, the scheduled
 * order-history reads (recent every 60 s, older every 30 min, visible tab only), and a
 * refreshed sync-status read for the pill. Terminal Analytics does not use these.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { useExchangeAccount } from '@/contexts/ExchangeAccountContext';
import { fetchCachedOrderRows, fetchSyncMetadata } from '@/hooks/useBinanceOrderSync';
import { isUserChangePending } from './periodPlan';
import {
  combinePartFlags, createDashboardClock, dashboardReadOptionsBase, mergePartRows, readPeriodState, retryFailedParts,
  type CombinedFlags, type PartState,
} from './dashParts';
export { combineDashboardParts, createDashboardClock, retryFailedParts } from './dashParts';
import { DashboardPeriodPlan, OLDER_REREAD_MS, RECENT_REREAD_MS, ReadRange } from './periodPlan';

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
    // R2 · C3: commit the new clock (and so the new read keys) before TanStack's own
    // visibilitychange listener on window runs its focus refetch, so stale keys are not re-read.
    const onVis = () => { flushSync(() => clock.visibilityChanged()); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, []);
  const bumpRef = useRef(() => clockRef.current!.tick());
  return [now, bumpRef.current];
}

function useRead(range: ReadRange | null, scheduled: boolean, interval: number) {
  const { accountsToQuery } = useExchangeAccount();
  return useQuery({
    ...dashboardReadOptionsBase(accountsToQuery.join(','), accountsToQuery.length, range, scheduled, interval),
    queryFn: () => fetchCachedOrderRows(accountsToQuery, range!.startTimestamp, range!.endTimestamp),
  });
}

export function useDashboardOrders(plan: DashboardPeriodPlan) {
  const recent = useRead(plan.recent, plan.scheduled, RECENT_REREAD_MS);
  const older = useRead(plan.older, plan.scheduled, OLDER_REREAD_MS);
  const hasOlder = !!plan.older;
  // R2 · C4: the merged rows change only when a part's rows change, not on every fetch start/end.
  const data = useMemo(
    () => mergePartRows(recent.data, hasOlder ? older.data : undefined),
    [recent.data, older.data, hasOlder],
  );
  const flags = combinePartFlags(recent as PartState, hasOlder ? (older as PartState) : null);
  return {
    data,
    ...flags,
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
 * R2 · C1 — the order-history state as the page shows it (see readPeriodState): shimmer on a
 * first load and while a failed part runs again; "Updating…" only after a user change.
 */
export function useReadPeriodState(userKey: string, flags: Pick<CombinedFlags, 'isLoading' | 'partial' | 'isPlaceholderData'>) {
  const [settledKey, setSettledKey] = useState<string | null>(null);
  const state = readPeriodState(flags, settledKey, userKey);
  useEffect(() => { if (state.settled) setSettledKey(userKey); }, [state.settled, userKey]);
  return state;
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
