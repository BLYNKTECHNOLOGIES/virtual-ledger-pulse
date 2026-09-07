import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { pollWhenVisible } from '@/lib/poll-when-visible';

export interface NewerCounterpartyOrder {
  orderNumber: string;
  tradeType: string | null;
  asset: string | null;
  totalPrice: string | null;
  fiatUnit: string | null;
  createTime: number;
  orderStatus: string | null;
  exchangeAccountId: string | null;
}

/**
 * Detects whether the SAME counterparty has opened a NEWER order than the one
 * currently on screen.
 *
 * Binance chat is per-order: when a counterparty places a new order, their next
 * messages land in that new order's thread, not in the one the operator has
 * open. Without this the operator sits on a finished chat and believes messages
 * "are not arriving". Counterparty resolution is done server-side by
 * get_counterparty_order_history (never by masked nickname or takerUserNo).
 */
export function useNewerCounterpartyOrder(
  orderNumber: string | null,
  exchangeAccountId?: string | null,
) {
  return useQuery({
    queryKey: ['newer-counterparty-order', orderNumber, exchangeAccountId ?? null],
    queryFn: async (): Promise<NewerCounterpartyOrder | null> => {
      if (!orderNumber) return null;

      const [{ data: current }, { data: history, error }] = await Promise.all([
        supabase
          .from('binance_order_history')
          .select('create_time')
          .eq('order_number', orderNumber)
          .maybeSingle(),
        supabase.rpc('get_counterparty_order_history', {
          p_order_number: orderNumber,
          p_exchange_account_id: exchangeAccountId || null,
        }),
      ]);
      if (error) throw error;

      const currentTime = Number((current as any)?.create_time || 0);
      if (!currentTime) return null;

      const newer = (history || [])
        .filter((o: any) => Number(o.create_time || 0) > currentTime)
        .sort((a: any, b: any) => Number(b.create_time) - Number(a.create_time))[0];
      if (!newer) return null;

      return {
        orderNumber: String(newer.order_number),
        tradeType: newer.trade_type ?? null,
        asset: newer.asset ?? null,
        totalPrice: newer.total_price ?? null,
        fiatUnit: newer.fiat_unit ?? null,
        createTime: Number(newer.create_time || 0),
        orderStatus: newer.order_status ?? null,
        exchangeAccountId: newer.exchange_account_id ?? null,
      };
    },
    enabled: !!orderNumber,
    staleTime: 15_000,
    refetchInterval: pollWhenVisible(30_000),
  });
}
