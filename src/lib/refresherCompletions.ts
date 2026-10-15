import { supabase } from '@/integrations/supabase/client';

/** TD-FIX-A (D2): orders the server's open-order refresher moved to COMPLETED recently. */
export const REFRESHER_COMPLETION_DAYS = 3;

export async function fetchRefresherCompletedOrders(tradeType: 'BUY' | 'SELL', nowMs = Date.now()): Promise<any[]> {
  const since = new Date(nowMs - REFRESHER_COMPLETION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await (supabase as any).rpc('refresher_completed_orders', { p_trade_type: tradeType, p_since: since });
  if (error) {
    console.warn('[refresherCompletions] lookup failed:', error.message);
    return [];
  }
  return (data as any[]) || [];
}

/** Adds refresher completions not already in the 7-day selection (by order number). */
export function mergeRefresherCompletions<T extends { order_number: string }>(base: T[], extra: T[]): T[] {
  const seen = new Set(base.map((o) => o.order_number));
  const out = [...base];
  for (const o of extra) {
    if (!seen.has(o.order_number)) { seen.add(o.order_number); out.push(o); }
  }
  return out;
}
