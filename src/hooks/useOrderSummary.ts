import { useMemo } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useExchangeAccount } from '@/contexts/ExchangeAccountContext';
import { aggregateSummaryRows, EMPTY_SUMMARY, OrderSummaryRow, SummaryAggregate } from '@/lib/orderSummary';

export { SEALED_WINDOW_MS, getSealedCutoffMs } from '@/lib/sealedSplit';

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
 * Pre-computed totals for the sealed part of the window (server-side aggregate,
 * shared by every user — no Binance call, no per-browser row download).
 */
export function useOrderSummary(plan: Pick<OrderWindowPlan, 'usesSummary' | 'startTimestamp' | 'sealedCutoff' | 'windows'>) {
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
