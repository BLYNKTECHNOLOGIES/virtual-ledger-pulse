import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdZone } from '@/lib/adZone';

export type CapacitySource = 'manual';

export interface AdCapacityLimit {
  id: string;
  exchange_account_id: string;
  asset: string;
  zone: AdZone;
  trade_type: 'BUY' | 'SELL';
  max_accepted_qty: number | null;
  source: CapacitySource;
  updated_at: string;
}

export function capacityKey(accountId: string | null | undefined, asset: string, zone: AdZone, tradeType: string) {
  return `${accountId || 'default'}|${String(asset).toUpperCase()}|${zone}|${String(tradeType).toUpperCase()}`;
}

export function useAdCapacityLimits() {
  return useQuery({
    queryKey: ['ad_capacity_limits'],
    queryFn: async (): Promise<AdCapacityLimit[]> => {
      const { data, error } = await supabase
        .from('binance_ad_capacity_limits')
        .select('*')
        .order('asset', { ascending: true });
      if (error) throw error;
      return (data || []).map((r: any) => ({ ...r, max_accepted_qty: r.max_accepted_qty === null ? null : Number(r.max_accepted_qty) })) as AdCapacityLimit[];
    },
    staleTime: 60_000,
  });
}

/** Lookup map keyed by account|asset|zone|side. */
export function useAdCapacityMap() {
  const q = useAdCapacityLimits();
  const map = new Map<string, AdCapacityLimit>();
  (q.data || []).forEach((row) => {
    map.set(capacityKey(row.exchange_account_id, row.asset, row.zone, row.trade_type), row);
  });
  return { ...q, map };
}

/** Manual maximum-quantity write. */
export function useUpsertCapacityLimit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: {
      exchange_account_id: string;
      asset: string;
      zone: AdZone;
      trade_type: 'BUY' | 'SELL';
      max_accepted_qty: number;
      source?: CapacitySource;
    }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('binance_ad_capacity_limits')
        .upsert({
          ...row,
          asset: row.asset.toUpperCase(),
          updated_by: auth?.user?.id ?? null,
        }, { onConflict: 'exchange_account_id,asset,zone,trade_type' });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ad_capacity_limits'] }); },
  });
}
