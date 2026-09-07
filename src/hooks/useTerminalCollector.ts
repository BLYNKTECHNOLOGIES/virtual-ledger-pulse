import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Collector heartbeat — tells the UI whether the server-side order collector
 * is keeping terminal_active_orders_cache fresh. The cron-started collector
 * writes a heartbeat every tick (~4.5s while trading, ~12s idle).
 */

export interface CollectorState {
  last_tick_at: string | null;
  last_status: string;
  detail: { activeOrders?: number; accounts?: number; consecutiveFailures?: number } | null;
}

export const COLLECTOR_STALE_MS = 45 * 1000;

export function useTerminalCollectorState() {
  const queryClient = useQueryClient();

  // Realtime: any cache write or heartbeat change nudges dependent queries.
  useEffect(() => {
    const channel = supabase
      .channel('terminal-collector')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'terminal_active_orders_cache' }, () => {
        queryClient.invalidateQueries({ queryKey: ['binance-active-orders'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'terminal_collector_state' }, () => {
        queryClient.invalidateQueries({ queryKey: ['terminal-collector-state'] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ['terminal-collector-state'],
    queryFn: async (): Promise<CollectorState | null> => {
      const { data, error } = await supabase
        .from('terminal_collector_state')
        .select('last_tick_at, last_status, detail')
        .eq('id', 'active_orders')
        .maybeSingle();
      if (error) throw error;
      return (data as CollectorState | null) ?? null;
    },
    refetchInterval: 30 * 1000,
    staleTime: 10 * 1000,
  });
}

export function isCollectorStale(state: CollectorState | null | undefined): boolean {
  if (!state?.last_tick_at) return true;
  if (state.last_status === 'error') return true;
  return Date.now() - new Date(state.last_tick_at).getTime() > COLLECTOR_STALE_MS;
}

/** Ask the collector for one immediate tick (manual "refresh from Binance"). */
export async function triggerCollectorTick(): Promise<void> {
  const { error } = await supabase.functions.invoke('terminal-order-collector', {
    body: { mode: 'single' },
  });
  if (error) throw error;
}
