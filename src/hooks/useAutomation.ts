import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { logAdAction, AdActionTypes } from '@/hooks/useAdActionLog';

export interface AutoReplyRule {
  id: string;
  name: string;
  trigger_event: 'order_received' | 'payment_marked' | 'timer_breach' | 'order_cancelled' | 'order_appealed' | 'payment_pending';
  trade_type: 'BUY' | 'SELL' | 'SMALL_BUY' | 'SMALL_SELL' | null;
  message_template: string;
  delay_seconds: number;
  is_active: boolean;
  priority: number;
  conditions: Record<string, any>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutoReplyLog {
  id: string;
  rule_id: string | null;
  order_number: string;
  trigger_event: string;
  message_sent: string;
  status: 'sent' | 'failed' | 'skipped';
  error_message: string | null;
  executed_at: string;
}

export interface MerchantSchedule {
  id: string;
  name: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
  action: 'go_online' | 'go_offline' | 'take_rest';
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const TRIGGER_LABELS: Record<string, string> = {
  order_received: 'Order Received',
  payment_marked: 'Payment Marked',
  payment_pending: 'Payment Pending (5min+)',
  order_cancelled: 'Order Cancelled',
  order_appealed: 'Appeal Raised',
  timer_breach: 'Timer Breach (15min+)',
};

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export { TRIGGER_LABELS, DAY_LABELS };

// ─── Auto-Reply Rules ──────────────────────────────────

export function useAutoReplyRules() {
  return useQuery({
    queryKey: ['auto-reply-rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('p2p_auto_reply_rules')
        .select('*')
        .order('priority', { ascending: true });
      if (error) throw error;
      return data as AutoReplyRule[];
    },
  });
}

export function useCreateAutoReplyRule() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (rule: Partial<AutoReplyRule>) => {
      const { data, error } = await supabase
        .from('p2p_auto_reply_rules')
        .insert(rule as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['auto-reply-rules'] });
      toast({ title: 'Rule Created', description: 'Auto-reply rule saved successfully.' });
      logAdAction({ actionType: AdActionTypes.AUTO_REPLY_RULE_CREATED, adDetails: { name: variables.name, trigger_event: variables.trigger_event, trade_type: variables.trade_type } });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}

export function useUpdateAutoReplyRule() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<AutoReplyRule> & { id: string }) => {
      const { error } = await supabase
        .from('p2p_auto_reply_rules')
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['auto-reply-rules'] });
      const isToggle = Object.keys(variables).length === 2 && 'is_active' in variables;
      if (isToggle) {
        logAdAction({ actionType: AdActionTypes.AUTO_REPLY_RULE_TOGGLED, adDetails: { ruleId: variables.id, is_active: variables.is_active } });
      } else {
        logAdAction({ actionType: AdActionTypes.AUTO_REPLY_RULE_UPDATED, adDetails: { ruleId: variables.id, ...variables } });
      }
      toast({ title: 'Rule Updated' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}

export function useDeleteAutoReplyRule() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('p2p_auto_reply_rules').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, ruleId) => {
      qc.invalidateQueries({ queryKey: ['auto-reply-rules'] });
      toast({ title: 'Rule Deleted' });
      logAdAction({ actionType: AdActionTypes.AUTO_REPLY_RULE_DELETED, adDetails: { ruleId } });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}

// ─── Auto-Reply Logs ──────────────────────────────────

export function useAutoReplyLogs(limit = 50) {
  return useQuery({
    queryKey: ['auto-reply-logs', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('p2p_auto_reply_log')
        .select('*')
        .order('executed_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as AutoReplyLog[];
    },
    refetchInterval: 30_000,
  });
}

// ─── Merchant Schedules ──────────────────────────────────

export function useMerchantSchedules() {
  return useQuery({
    queryKey: ['merchant-schedules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('p2p_merchant_schedules')
        .select('*')
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true });
      if (error) throw error;
      return data as MerchantSchedule[];
    },
  });
}

export function useCreateMerchantSchedule() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (schedule: Partial<MerchantSchedule>) => {
      const { data, error } = await supabase
        .from('p2p_merchant_schedules')
        .insert(schedule as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['merchant-schedules'] });
      toast({ title: 'Schedule Created' });
      logAdAction({ actionType: AdActionTypes.SCHEDULE_CREATED, adDetails: { name: variables.name, day_of_week: variables.day_of_week, action: variables.action } });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}

export function useUpdateMerchantSchedule() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<MerchantSchedule> & { id: string }) => {
      const { error } = await supabase
        .from('p2p_merchant_schedules')
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['merchant-schedules'] });
      const isToggle = Object.keys(variables).length === 2 && 'is_active' in variables;
      if (isToggle) {
        logAdAction({ actionType: AdActionTypes.SCHEDULE_TOGGLED, adDetails: { scheduleId: variables.id, is_active: variables.is_active } });
      } else {
        logAdAction({ actionType: AdActionTypes.SCHEDULE_UPDATED, adDetails: { scheduleId: variables.id, ...variables } });
      }
      toast({ title: 'Schedule Updated' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}

export function useDeleteMerchantSchedule() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('p2p_merchant_schedules').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, scheduleId) => {
      qc.invalidateQueries({ queryKey: ['merchant-schedules'] });
      toast({ title: 'Schedule Deleted' });
      logAdAction({ actionType: AdActionTypes.SCHEDULE_DELETED, adDetails: { scheduleId } });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}
