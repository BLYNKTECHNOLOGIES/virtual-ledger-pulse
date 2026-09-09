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

export interface CounterpartyPanelData {
  profile: CounterpartyProfileStats | null;
  pastOrders: CounterpartyPastOrder[];
}

const toNumber = (value: unknown) => (value === null || value === undefined ? 0 : Number(value));

/** One indexed request for the counterparty summary and its past orders. */
export function useCounterpartyPanel(orderNumber?: string | null, exchangeAccountId?: string | null) {
  return useQuery<CounterpartyPanelData>({
    queryKey: ['counterparty_panel', orderNumber, exchangeAccountId ?? null],
    enabled: !!orderNumber && !orderNumber.startsWith('INQ-'),
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_counterparty_panel', {
        p_order_number: orderNumber,
        p_exchange_account_id: exchangeAccountId ?? null,
      });
      if (error) throw error;
      const result = (data || {}) as Record<string, any>;
      const rawProfile = result.profile as Record<string, any> | null | undefined;
      const rawOrders = Array.isArray(result.past_orders) ? result.past_orders : [];

      const profile = rawProfile && toNumber(rawProfile.total_orders) > 0 ? {
        ...rawProfile,
        total_orders: toNumber(rawProfile.total_orders),
        completed_orders: toNumber(rawProfile.completed_orders),
        cancelled_orders: toNumber(rawProfile.cancelled_orders),
        complaint_orders: toNumber(rawProfile.complaint_orders),
        buy_orders: toNumber(rawProfile.buy_orders),
        sell_orders: toNumber(rawProfile.sell_orders),
        total_value: toNumber(rawProfile.total_value),
        avg_value: toNumber(rawProfile.avg_value),
        median_value: toNumber(rawProfile.median_value),
        total_asset_amount: toNumber(rawProfile.total_asset_amount),
        first_trade_time: rawProfile.first_trade_time ? Number(rawProfile.first_trade_time) : null,
        last_trade_time: rawProfile.last_trade_time ? Number(rawProfile.last_trade_time) : null,
        avg_pay_minutes: rawProfile.avg_pay_minutes === null ? null : Number(rawProfile.avg_pay_minutes),
        pay_sample: toNumber(rawProfile.pay_sample),
        avg_release_minutes: rawProfile.avg_release_minutes === null ? null : Number(rawProfile.avg_release_minutes),
        release_sample: toNumber(rawProfile.release_sample),
      } as CounterpartyProfileStats : null;

      const pastOrders = (rawOrders as CounterpartyPastOrder[])
        .slice()
        .sort((a, b) => Number(b.create_time || 0) - Number(a.create_time || 0));

      return { profile, pastOrders };
    },
  });
}
