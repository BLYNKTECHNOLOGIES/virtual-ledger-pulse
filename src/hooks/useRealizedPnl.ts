
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface RealizedPnlEvent {
  id: string;
  conversion_id: string;
  wallet_id: string;
  asset_code: string;
  sell_qty: number;
  proceeds_usdt_gross: number;
  proceeds_usdt_net: number;
  cost_out_usdt: number;
  realized_pnl_usdt: number;
  avg_cost_at_sale: number;
  created_at: string;
}

export interface RealizedPnlFilters {
  walletId?: string;
  assetCode?: string;
  dateFrom?: string;
  dateTo?: string;
}

export function useRealizedPnlEvents(filters: RealizedPnlFilters = {}) {
  return useQuery({
    queryKey: ['realized_pnl_events', filters],
    queryFn: async () => {
      let query = supabase
        .from('realized_pnl_events' as any)
        .select('*')
        .order('created_at', { ascending: false });

      if (filters.walletId) query = query.eq('wallet_id', filters.walletId);
      if (filters.assetCode) query = query.eq('asset_code', filters.assetCode);
      if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom);
      if (filters.dateTo) query = query.lte('created_at', filters.dateTo + 'T23:59:59');

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as RealizedPnlEvent[];
    },
  });
}
