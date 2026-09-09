import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Collector heartbeat — tells the UI whether the server-side order collector
 * is keeping terminal_active_orders_cache fresh. The cron-started collector
 * writes a heartbeat every tick (~4.5s while trading, ~12s idle).
 *
 * Freshness is computed on the SERVER (terminal_collector_heartbeat RPC) so a
 * skewed browser clock can never fake staleness; the client only adds the time
 * elapsed since it received the answer.
 */

export interface CollectorState {
  last_tick_at: string | null;
  last_status: string;
  detail: { activeOrders?: number; accounts?: number; consecutiveFailures?: number } | null;
  /** Server-measured age of the heartbeat at fetch time (seconds). */
  heartbeat_age_seconds: number | null;
  /** Server-measured age of the newest cached order row (seconds). */
  cache_age_seconds: number | null;
  cached_orders: number | null;
  /** Client timestamp when this answer arrived (for elapsed-time correction). */
  fetched_at_ms: number;
}

export interface ChatListenerState {
  last_tick_at: string | null;
  last_status: string;
  detail: { accounts?: number; connected?: number; lastMessageAt?: string; reconnects?: number } | null;
}

export const COLLECTOR_STALE_MS = 60 * 1000;

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
      const { data, error } = await supabase.rpc('terminal_collector_heartbeat');
      if (error) throw error;
      const row = Array.isArray(data) ? (data[0] as any) : (data as any);
      if (!row) return null;
      return {
        last_tick_at: row.last_tick_at ?? null,
        last_status: row.last_status ?? 'unknown',
        detail: (row.detail as CollectorState['detail']) ?? null,
        heartbeat_age_seconds: row.heartbeat_age_seconds != null ? Number(row.heartbeat_age_seconds) : null,
        cache_age_seconds: row.cache_age_seconds != null ? Number(row.cache_age_seconds) : null,
        cached_orders: row.cached_orders != null ? Number(row.cached_orders) : null,
        fetched_at_ms: Date.now(),
      };
    },
    // Cheap RPC — keep it ticking even when the tab is in the background so the
    // banner can never freeze on an old timestamp.
    refetchInterval: 15 * 1000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    staleTime: 5 * 1000,
  });
}

export function isCollectorStale(state: CollectorState | null | undefined): boolean {
  if (!state?.last_tick_at) return true;
  if (state.last_status === 'error') return true;
  const serverAgeMs = (state.heartbeat_age_seconds ?? 0) * 1000;
  const elapsedSinceFetch = Math.max(0, Date.now() - state.fetched_at_ms);
  return serverAgeMs + elapsedSinceFetch > COLLECTOR_STALE_MS;
}

export function useTerminalChatListenerState() {
  return useQuery({
    queryKey: ['terminal-chat-listener-state'],
    queryFn: async (): Promise<ChatListenerState | null> => {
      const { data, error } = await supabase
        .from('terminal_collector_state')
        .select('last_tick_at, last_status, detail')
        .eq('id', 'chat_listener')
        .maybeSingle();
      if (error) throw error;
      return data as ChatListenerState | null;
    },
    refetchInterval: 15_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    staleTime: 5_000,
  });
}

export function isChatListenerHealthy(state: ChatListenerState | null | undefined): boolean {
  if (!state?.last_tick_at || state.last_status !== 'ok') return false;
  const heartbeatAge = Date.now() - new Date(state.last_tick_at).getTime();
  const expectedAccounts = Number(state.detail?.accounts || 0);
  const connectedAccounts = Number(state.detail?.connected || 0);
  return heartbeatAge < COLLECTOR_STALE_MS && expectedAccounts > 0 && connectedAccounts >= expectedAccounts;
}

/** Ask the collector for one immediate tick (manual "refresh from Binance"). */
export async function triggerCollectorTick(): Promise<void> {
  const { error } = await supabase.functions.invoke('terminal-order-collector', {
    body: { mode: 'single' },
  });
  if (error) throw error;
}
