import { useMemo } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useExchangeAccount } from '@/contexts/ExchangeAccountContext';
import { TimeFilter, buildShiftWindows } from '@/components/terminal/dashboard/TimePeriodFilter';
import { aggregateSummaryRows, EMPTY_SUMMARY, OrderSummaryRow, SummaryAggregate } from '@/lib/orderSummary';

/** Orders older than this are final — they are served from pre-computed buckets. */
export const SEALED_WINDOW_MS = 45 * 24 * 60 * 60 * 1000;
const BUCKET_MS = 30 * 60 * 1000;

/** Bucket-aligned sealed cutoff, stable for 30 minutes so caching works. */
export function getSealedCutoffMs(now: number = Date.now()): number {
  return Math.floor((now - SEALED_WINDOW_MS) / BUCKET_MS) * BUCKET_MS;
}

export type OrderWindowPlan = {
  /** Whole selected window. */
  startTimestamp: number;
  endTimestamp: number;
  /** Sealed cutoff used to split pre-computed history from live raw rows. */
  sealedCutoff: number;
  /** True when part of the window is older than the sealed cutoff. */
  usesSummary: boolean;
  /** Range of raw rows the browser still downloads. */
  rawRange: { startTimestamp: number; endTimestamp: number };
  /** Per-day shift slices (empty array = whole span). */
  windows: [number, number][];
};

/**
 * Split the selected filter window into "pre-computed history" + "live tail".
 * Short windows (inside 45 days) keep the existing all-raw behaviour.
 */
export function useOrderWindowPlan(filter: TimeFilter, bounds: { startTimestamp: number; endTimestamp: number }): OrderWindowPlan {
  return useMemo(() => {
    const sealedCutoff = getSealedCutoffMs();
    const usesSummary = bounds.startTimestamp < sealedCutoff;
    const shiftWindows = buildShiftWindows(filter);
    return {
      startTimestamp: bounds.startTimestamp,
      endTimestamp: bounds.endTimestamp,
      sealedCutoff,
      usesSummary,
      rawRange: {
        startTimestamp: usesSummary ? sealedCutoff : bounds.startTimestamp,
        endTimestamp: bounds.endTimestamp,
      },
      windows: shiftWindows.map((w) => [w.start, w.end] as [number, number]),
    };
  }, [filter, bounds.startTimestamp, bounds.endTimestamp]);
}

/**
 * Pre-computed totals for the sealed part of the window (server-side aggregate,
 * shared by every user — no Binance call, no per-browser row download).
 */
export function useOrderSummary(plan: OrderWindowPlan) {
  const { accountsToQuery } = useExchangeAccount();

  const query = useQuery({
    queryKey: [
      'terminal-order-summary',
      accountsToQuery.join(','),
      plan.startTimestamp,
      plan.sealedCutoff,
      JSON.stringify(plan.windows),
    ],
    enabled: plan.usesSummary && accountsToQuery.length > 0,
    queryFn: async (): Promise<OrderSummaryRow[]> => {
      const { data, error } = await (supabase as any).rpc('get_terminal_order_summary', {
        p_start_ms: plan.startTimestamp,
        p_end_ms: plan.sealedCutoff,
        p_accounts: accountsToQuery,
        p_windows: plan.windows,
        p_sealed_cutoff_ms: plan.sealedCutoff,
      });
      if (error) throw error;
      return (data || []) as OrderSummaryRow[];
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const aggregate: SummaryAggregate = useMemo(
    () => (plan.usesSummary && query.data ? aggregateSummaryRows(query.data) : EMPTY_SUMMARY),
    [plan.usesSummary, query.data]
  );

  return { ...query, aggregate };
}
