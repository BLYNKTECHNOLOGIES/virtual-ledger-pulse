import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CounterpartyProfileStats {
  counterparty_no: string | null;
  counterparty_nickname: string | null;
  verified_name: string | null;
  total_orders: number;
  completed_orders: number;
  cancelled_orders: number;
  complaint_orders: number;
  buy_orders: number;
  sell_orders: number;
  total_value: number;
  avg_value: number;
  median_value: number;
  total_asset_amount: number;
  first_trade_time: number | null;
  last_trade_time: number | null;
  top_pay_method: string | null;
  avg_pay_minutes: number | null;
  pay_sample: number;
  avg_release_minutes: number | null;
  release_sample: number;
}

export interface CounterpartyPastOrder {
  order_number: string;
  trade_type: string;
  asset: string;
  total_price: string | null;
  fiat_unit: string | null;
  create_time: number | null;
  exchange_account_id: string | null;
  order_status: string | null;
}

/** Aggregate trade record for the counterparty on the other side of this order. */
export function useCounterpartyProfile(orderNumber?: string | null, exchangeAccountId?: string | null) {
  return useQuery<CounterpartyProfileStats | null>({
    queryKey: ['counterparty_profile', orderNumber, exchangeAccountId ?? null],
    enabled: !!orderNumber && !orderNumber.startsWith('INQ-'),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_counterparty_profile', {
        p_order_number: orderNumber,
        p_exchange_account_id: exchangeAccountId ?? null,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return null;
      const num = (v: any) => (v === null || v === undefined ? 0 : Number(v));
      return {
        ...row,
        total_orders: num(row.total_orders),
        completed_orders: num(row.completed_orders),
        cancelled_orders: num(row.cancelled_orders),
        complaint_orders: num(row.complaint_orders),
        buy_orders: num(row.buy_orders),
        sell_orders: num(row.sell_orders),
        total_value: num(row.total_value),
        avg_value: num(row.avg_value),
        median_value: num(row.median_value),
        total_asset_amount: num(row.total_asset_amount),
        first_trade_time: row.first_trade_time ? Number(row.first_trade_time) : null,
        last_trade_time: row.last_trade_time ? Number(row.last_trade_time) : null,
        avg_pay_minutes: row.avg_pay_minutes === null ? null : Number(row.avg_pay_minutes),
        pay_sample: num(row.pay_sample),
        avg_release_minutes: row.avg_release_minutes === null ? null : Number(row.avg_release_minutes),
        release_sample: num(row.release_sample),
      } as CounterpartyProfileStats;
    },
  });
}

/** Past orders with the same counterparty (excludes the current order). */
export function useCounterpartyPastOrders(orderNumber?: string | null, exchangeAccountId?: string | null) {
  return useQuery<CounterpartyPastOrder[]>({
    queryKey: ['counterparty_past_orders', orderNumber, exchangeAccountId ?? null],
    enabled: !!orderNumber && !orderNumber.startsWith('INQ-'),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_counterparty_order_history', {
        p_order_number: orderNumber,
        p_exchange_account_id: exchangeAccountId ?? null,
      });
      if (error) throw error;
      const rows = (data || []) as CounterpartyPastOrder[];
      return rows
        .slice()
        .sort((a, b) => Number(b.create_time || 0) - Number(a.create_time || 0));
    },
  });
}
