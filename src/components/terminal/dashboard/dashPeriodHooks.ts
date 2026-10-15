/**
 * TD-FIX-B F5 — dashboard-only hooks: one page clock, the scheduled order-history
 * reads (recent every 60 s, older every 30 min, visible tab only), and a refreshed
 * sync-status read for the pill. Terminal Analytics does not use these.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useExchangeAccount } from '@/contexts/ExchangeAccountContext';
import { fetchCachedOrderRows, fetchSyncMetadata } from '@/hooks/useBinanceOrderSync';
import { isUserChangePending } from './periodPlan';
import { DashboardPeriodPlan, OLDER_REREAD_MS, RECENT_REREAD_MS, ReadRange } from './periodPlan';

/** "Now" for every period calculation: advances every 60 s, on tab show, and on bump(). */
export function useDashboardClock(): [number, () => void] {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, 60_000);
    const onVis = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, []);
  const bumpRef = useRef(() => setNow(Date.now()));
  return [now, bumpRef.current];
}

function useRead(range: ReadRange | null, scheduled: boolean, interval: number) {
  const { accountsToQuery } = useExchangeAccount();
  return useQuery({
    // Prefix 'cached-order-history' so sync success / Universal sync invalidations reach it.
    queryKey: ['cached-order-history', 'dashboard', accountsToQuery.join(','), range?.startTimestamp ?? null, range?.endTimestamp ?? null],
    enabled: !!range && accountsToQuery.length > 0,
    queryFn: () => fetchCachedOrderRows(accountsToQuery, range!.startTimestamp, range!.endTimestamp),
    staleTime: scheduled ? interval : 2 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    placeholderData: keepPreviousData,
    refetchInterval: scheduled ? interval : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: scheduled,
  });
}

export function useDashboardOrders(plan: DashboardPeriodPlan) {
  const recent = useRead(plan.recent, plan.scheduled, RECENT_REREAD_MS);
  const older = useRead(plan.older, plan.scheduled, OLDER_REREAD_MS);
  const hasOlder = !!plan.older;
  const data = useMemo(
    () => [...(recent.data ?? []), ...(hasOlder ? older.data ?? [] : [])],
    [recent.data, older.data, hasOlder],
  );
  return {
    data,
    isLoading: recent.isLoading || (hasOlder && older.isLoading),
    isError: recent.isError || (hasOlder && older.isError),
    isFetching: recent.isFetching || (hasOlder && older.isFetching),
    isPlaceholderData: recent.isPlaceholderData || (hasOlder && older.isPlaceholderData),
    dataUpdatedAt: hasOlder ? Math.min(recent.dataUpdatedAt, older.dataUpdatedAt) : recent.dataUpdatedAt,
    lastReadAt: Math.max(recent.dataUpdatedAt, hasOlder ? older.dataUpdatedAt : 0),
    refetch: () => { recent.refetch(); if (hasOlder) older.refetch(); },
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
