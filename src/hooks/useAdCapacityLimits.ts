import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdZone } from '@/lib/adZone';

export type CapacitySource = 'probe' | 'manual' | 'learned';

export interface AdCapacityLimit {
  id: string;
  exchange_account_id: string;
  asset: string;
  zone: AdZone;
  trade_type: 'BUY' | 'SELL';
  max_accepted_qty: number | null;
  min_rejected_qty: number | null;
  source: CapacitySource;
  binance_error_code: string | null;
  binance_error_message: string | null;
  needs_recalibration: boolean;
  last_probed_at: string | null;
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
      return (data || []).map((r: any) => ({ ...r, max_accepted_qty: r.max_accepted_qty === null ? null : Number(r.max_accepted_qty), min_rejected_qty: r.min_rejected_qty === null ? null : Number(r.min_rejected_qty) })) as AdCapacityLimit[];
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

export interface ProbeArgs {
  asset: string;
  zone: AdZone;
  tradeType: 'BUY' | 'SELL';
  carrierAdvNo: string;
  exchange_account_id?: string | null;
  upperBound: number;
  runId?: string;
}

export interface ProbeResult {
  success: boolean;
  error?: string;
  maxAccepted: number | null;
  minRejected: number | null;
  saved?: boolean;
  abortReason?: string | null;
  restored?: boolean;
  restoreError?: string | null;
  attempts?: Array<{ qty: number; accepted: boolean; code: string; message: string }>;
}

export function useRunCapacityProbe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: ProbeArgs): Promise<ProbeResult> => {
      const { data, error } = await supabase.functions.invoke('binance-ad-capacity-probe', { body: args });
      if (error) throw new Error(error.message);
      if (data && data.success === false && data.error) throw new Error(data.error);
      return data as ProbeResult;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ad_capacity_limits'] }); },
  });
}

/** Manual override / learned-from-rejection write. */
export function useUpsertCapacityLimit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: {
      exchange_account_id: string;
      asset: string;
      zone: AdZone;
      trade_type: 'BUY' | 'SELL';
      max_accepted_qty: number;
      min_rejected_qty?: number | null;
      source: CapacitySource;
      binance_error_message?: string | null;
      needs_recalibration?: boolean;
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
