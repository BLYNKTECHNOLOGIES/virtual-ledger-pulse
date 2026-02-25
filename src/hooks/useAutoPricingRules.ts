import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { logAdAction, AdActionTypes } from '@/hooks/useAdActionLog';

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

/** Determine if a rule is in an alert state that needs attention */
export function getRuleAlertState(rule: AutoPricingRule): {
  hasAlert: boolean;
  alertType: 'merchant_missing' | 'deviation' | 'error' | 'auto_paused' | null;
  alertMessage: string | null;
} {
  if (!rule.is_active && (rule.consecutive_deviations >= rule.auto_pause_after_deviations)) {
    return { hasAlert: true, alertType: 'auto_paused', alertMessage: 'Auto-paused: deviation limit exceeded' };
  }
  if (rule.last_error) {
    const err = rule.last_error.toLowerCase();
    if (err.includes('no_merchant') || err.includes('merchant not found') || err.includes('no_listings')) {
      return { hasAlert: true, alertType: 'merchant_missing', alertMessage: `Merchant not found: ${rule.target_merchant}` };
    }
    if (err.includes('deviation')) {
      return { hasAlert: true, alertType: 'deviation', alertMessage: 'Price deviation limit triggered' };
    }
    if (err.includes('break') || err.includes('rest')) {
      return { hasAlert: true, alertType: 'error', alertMessage: 'Binance rest/break mode active' };
    }
    return { hasAlert: true, alertType: 'error', alertMessage: rule.last_error };
  }
  if (rule.consecutive_errors > 3) {
    return { hasAlert: true, alertType: 'error', alertMessage: `${rule.consecutive_errors} consecutive errors` };
  }
  if (rule.consecutive_deviations > 2) {
    return { hasAlert: true, alertType: 'deviation', alertMessage: `${rule.consecutive_deviations} consecutive deviations` };
  }
  return { hasAlert: false, alertType: null, alertMessage: null };
}

export interface AssetAlertInfo {
  asset: string;
  status: string;
  reason: string | null;
  error: string | null;
  competitor_merchant: string | null;
  applied_price: number | null;
  applied_ratio: number | null;
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

/** Fetch the latest log per asset per rule for per-asset status display */
export function useLatestAssetLogs(ruleIds: string[]) {
  return useQuery({
    queryKey: ['auto-pricing-asset-logs', ruleIds],
    enabled: ruleIds.length > 0,
    queryFn: async () => {
      // Fetch recent logs for all active rules (last cycle only, ~1 per asset)
      const { data, error } = await supabase
        .from('ad_pricing_logs')
        .select('rule_id, asset, status, skipped_reason, error_message, competitor_merchant, applied_price, applied_ratio, created_at')
        .in('rule_id', ruleIds)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;

      // Group by rule_id, keeping only the latest log per asset per rule
      const byRule: Record<string, AssetAlertInfo[]> = {};
      const seen = new Set<string>();
      for (const log of data || []) {
        const key = `${log.rule_id}:${log.asset}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (!byRule[log.rule_id]) byRule[log.rule_id] = [];
        byRule[log.rule_id].push({
          asset: log.asset || '',
          status: log.status,
          reason: log.skipped_reason,
          error: log.error_message,
          competitor_merchant: log.competitor_merchant,
          applied_price: log.applied_price,
          applied_ratio: log.applied_ratio,
        });
      }
      return byRule;
    },
    refetchInterval: 30000,
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
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['auto-pricing-rules'] });
      toast({ title: 'Rule Created', description: 'Auto-pricing rule created successfully.' });
      logAdAction({
        actionType: AdActionTypes.PRICING_RULE_CREATED,
        metadata: {
          rule_id: data.id,
          rule_name: data.name,
          trade_type: data.trade_type,
          price_type: data.price_type,
          target_merchant: data.target_merchant,
          assets: data.assets || [data.asset],
          ad_numbers: data.ad_numbers,
          offset_direction: data.offset_direction,
          description: `Created auto-pricing rule "${data.name}" targeting merchant "${data.target_merchant}" for ${data.trade_type} ${(data.assets || [data.asset]).join(', ')} with ${data.offset_direction} offset`,
        },
      });
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
      return { data, updates, id };
    },
    onSuccess: ({ data, updates, id }) => {
      qc.invalidateQueries({ queryKey: ['auto-pricing-rules'] });
      
      // Determine if this is a toggle or a general update
      const isToggle = Object.keys(updates).length === 1 && 'is_active' in updates;
      
      if (isToggle) {
        toast({ title: updates.is_active ? 'Rule Enabled' : 'Rule Paused' });
        logAdAction({
          actionType: AdActionTypes.PRICING_RULE_TOGGLED,
          metadata: {
            rule_id: id,
            rule_name: data.name,
            new_state: updates.is_active ? 'enabled' : 'disabled',
            description: `${updates.is_active ? 'Enabled' : 'Disabled'} auto-pricing rule "${data.name}"`,
          },
        });
      } else {
        toast({ title: 'Rule Updated' });
        const changedFields = Object.keys(updates).filter(k => k !== 'id');
        logAdAction({
          actionType: AdActionTypes.PRICING_RULE_UPDATED,
          metadata: {
            rule_id: id,
            rule_name: data.name,
            changed_fields: changedFields,
            updates,
            description: `Updated auto-pricing rule "${data.name}" — changed: ${changedFields.join(', ')}`,
          },
        });
      }
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}

export function useDeleteAutoPricingRule() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, ruleName }: { id: string; ruleName: string }) => {
      const { error } = await supabase.from('ad_pricing_rules').delete().eq('id', id);
      if (error) throw error;
      return { id, ruleName };
    },
    onSuccess: ({ id, ruleName }) => {
      qc.invalidateQueries({ queryKey: ['auto-pricing-rules'] });
      toast({ title: 'Rule Deleted' });
      logAdAction({
        actionType: AdActionTypes.PRICING_RULE_DELETED,
        metadata: {
          rule_id: id,
          rule_name: ruleName,
          description: `Deleted auto-pricing rule "${ruleName}"`,
        },
      });
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
    mutationFn: async ({ id, ruleName }: { id: string; ruleName: string }) => {
      const { data, error } = await supabase.functions.invoke('auto-price-engine', {
        body: { ruleId: id },
      });
      if (error) throw new Error(error.message);
      return { data, id, ruleName };
    },
    onSuccess: ({ id, ruleName }) => {
      qc.invalidateQueries({ queryKey: ['auto-pricing-rules'] });
      qc.invalidateQueries({ queryKey: ['auto-pricing-logs'] });
      toast({ title: 'Rule Triggered', description: 'Manual execution completed.' });
      logAdAction({
        actionType: AdActionTypes.PRICING_RULE_MANUAL_TRIGGER,
        metadata: {
          rule_id: id,
          rule_name: ruleName,
          description: `Manually triggered auto-pricing rule "${ruleName}"`,
        },
      });
    },
    onError: (e: Error) => toast({ title: 'Trigger Failed', description: e.message, variant: 'destructive' }),
  });
}

export function useResetRuleState() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, ruleName }: { id: string; ruleName: string }) => {
      const { error } = await supabase.from('ad_pricing_rules').update({
        consecutive_deviations: 0,
        consecutive_errors: 0,
        last_error: null,
        is_active: true,
      } as any).eq('id', id);
      if (error) throw error;
      return { id, ruleName };
    },
    onSuccess: ({ id, ruleName }) => {
      qc.invalidateQueries({ queryKey: ['auto-pricing-rules'] });
      toast({ title: 'Rule Reset', description: 'Errors and deviations cleared, rule re-enabled.' });
      logAdAction({
        actionType: AdActionTypes.PRICING_RULE_RESET,
        metadata: {
          rule_id: id,
          rule_name: ruleName,
          description: `Reset and re-enabled auto-pricing rule "${ruleName}" — cleared errors and deviations`,
        },
      });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}

export function useDismissRuleAlert() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, ruleName, alertMessage }: { id: string; ruleName: string; alertMessage: string }) => {
      const { error } = await supabase.from('ad_pricing_rules').update({
        last_error: null,
        consecutive_deviations: 0,
        consecutive_errors: 0,
      } as any).eq('id', id);
      if (error) throw error;
      return { id, ruleName, alertMessage };
    },
    onSuccess: ({ id, ruleName, alertMessage }) => {
      qc.invalidateQueries({ queryKey: ['auto-pricing-rules'] });
      toast({ title: 'Alert Dismissed' });
      logAdAction({
        actionType: AdActionTypes.PRICING_RULE_ALERT_DISMISSED,
        metadata: {
          rule_id: id,
          rule_name: ruleName,
          dismissed_alert: alertMessage,
          description: `Dismissed alert on rule "${ruleName}": ${alertMessage}`,
        },
      });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}
