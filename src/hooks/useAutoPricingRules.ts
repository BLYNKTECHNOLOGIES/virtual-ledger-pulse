import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface AssetConfig {
  ad_numbers: string[];
  offset_amount: number;
  offset_pct: number;
  max_ceiling: number | null;
  min_floor: number | null;
  max_ratio_ceiling: number | null;
  min_ratio_floor: number | null;
}

export interface AutoPricingRule {
  id: string;
  name: string;
  is_active: boolean;
  asset: string;
  assets: string[];
  asset_config: Record<string, AssetConfig>;
  fiat: string;
  trade_type: string;
  price_type: string;
  target_merchant: string;
  fallback_merchants: string[];
  ad_numbers: string[];
  offset_direction: string;
  offset_amount: number;
  offset_pct: number;
  max_ceiling: number | null;
  min_floor: number | null;
  max_ratio_ceiling: number | null;
  min_ratio_floor: number | null;
  max_deviation_from_market_pct: number;
  max_price_change_per_cycle: number | null;
  max_ratio_change_per_cycle: number | null;
  auto_pause_after_deviations: number;
  manual_override_cooldown_minutes: number;
  only_counter_when_online: boolean;
  pause_if_no_merchant_found: boolean;
  active_hours_start: string | null;
  active_hours_end: string | null;
  resting_price: number | null;
  resting_ratio: number | null;
  check_interval_seconds: number;
  last_checked_at: string | null;
  last_competitor_price: number | null;
  last_applied_price: number | null;
  last_applied_ratio: number | null;
  last_matched_merchant: string | null;
  last_error: string | null;
  consecutive_errors: number;
  consecutive_deviations: number;
  last_manual_edit_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutoPricingLog {
  id: string;
  rule_id: string;
  ad_number: string | null;
  asset: string | null;
  competitor_merchant: string | null;
  competitor_price: number | null;
  market_reference_price: number | null;
  deviation_from_market_pct: number | null;
  calculated_price: number | null;
  calculated_ratio: number | null;
  applied_price: number | null;
  applied_ratio: number | null;
  was_capped: boolean;
  was_rate_limited: boolean;
  skipped_reason: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

export function useAutoPricingRules() {
  return useQuery({
    queryKey: ['auto-pricing-rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ad_pricing_rules')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as unknown as AutoPricingRule[];
    },
  });
}

export function useCreateAutoPricingRule() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (rule: Partial<AutoPricingRule>) => {
      const { data, error } = await supabase.from('ad_pricing_rules').insert(rule as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auto-pricing-rules'] });
      toast({ title: 'Rule Created', description: 'Auto-pricing rule created successfully.' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}

export function useUpdateAutoPricingRule() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<AutoPricingRule> & { id: string }) => {
      const { data, error } = await supabase.from('ad_pricing_rules').update(updates as any).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auto-pricing-rules'] });
      toast({ title: 'Rule Updated' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}

export function useDeleteAutoPricingRule() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ad_pricing_rules').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auto-pricing-rules'] });
      toast({ title: 'Rule Deleted' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}

export function useAutoPricingLogs(ruleId?: string, limit = 100) {
  return useQuery({
    queryKey: ['auto-pricing-logs', ruleId, limit],
    queryFn: async () => {
      let query = supabase
        .from('ad_pricing_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (ruleId) query = query.eq('rule_id', ruleId);
      const { data, error } = await query;
      if (error) throw error;
      return data as AutoPricingLog[];
    },
  });
}

export function useSearchMerchant() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ asset, fiat, tradeType, nickname }: { asset: string; fiat: string; tradeType: string; nickname: string }) => {
      const { data, error } = await supabase.functions.invoke('binance-ads', {
        body: { action: 'searchP2PMerchant', asset, fiat, tradeType, nickname },
      });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || 'Search failed');
      return data.data;
    },
    onError: (e: Error) => toast({ title: 'Search Failed', description: e.message, variant: 'destructive' }),
  });
}

export function useManualTriggerRule() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (ruleId: string) => {
      const { data, error } = await supabase.functions.invoke('auto-price-engine', {
        body: { ruleId },
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auto-pricing-rules'] });
      qc.invalidateQueries({ queryKey: ['auto-pricing-logs'] });
      toast({ title: 'Rule Triggered', description: 'Manual execution completed.' });
    },
    onError: (e: Error) => toast({ title: 'Trigger Failed', description: e.message, variant: 'destructive' }),
  });
}

export function useResetRuleState() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ad_pricing_rules').update({
        consecutive_deviations: 0,
        consecutive_errors: 0,
        last_error: null,
        is_active: true,
      } as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auto-pricing-rules'] });
      toast({ title: 'Rule Reset', description: 'Errors and deviations cleared, rule re-enabled.' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}
