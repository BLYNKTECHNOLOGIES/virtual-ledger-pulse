import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTerminalAuth } from '@/hooks/useTerminalAuth';
import { toast } from 'sonner';

export type AppealStatus = 'requested' | 'under_appeal' | 'respond_by_set' | 'checked_in' | 'resolved' | 'closed' | 'cancelled';
export type AppealSource = 'binance_status' | 'small_payment_request' | 'manual_request';

export interface TerminalAppealCase {
  id: string;
  order_number: string;
  source: AppealSource;
  status: AppealStatus;
  appeal_started_at: string;
  requested_by: string | null;
  requested_from_case_id: string | null;
  request_reason: string | null;
  adv_no: string | null;
  trade_type: string | null;
  asset: string | null;
  fiat_unit: string | null;
  total_price: number | null;
  counterparty_nickname: string | null;
  binance_status: string | null;
  response_timer_minutes: number | null;
  response_due_at: string | null;
  response_timer_set_by: string | null;
  response_timer_set_at: string | null;
  last_checked_in_at: string | null;
  last_checked_in_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  requester?: any;
  checkedInBy?: any;
  timerSetBy?: any;
}

export const responseTimerOptions = [
  { value: '10', label: '10 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '60', label: '1 hour' },
  { value: '120', label: '2 hours' },
  { value: '240', label: '4 hours' },
  { value: '480', label: '8 hours' },
  { value: '1440', label: '1 day' },
  { value: 'none', label: 'No timer' },
];

export function getAppealUserName(user: any) {
  if (!user) return '—';
  const full = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  return full || user.username || '—';
}

export function getElapsedMinutes(start?: string | null) {
  if (!start) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(start).getTime()) / 60000));
}

export function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h < 24) return m ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh ? `${d}d ${rh}h` : `${d}d`;
}

export function isAppealCheckInPending(caseItem: TerminalAppealCase, now = Date.now()) {
  if (['resolved', 'closed', 'cancelled'].includes(caseItem.status)) return false;

  const needsInitialTimer =
    caseItem.status === 'under_appeal' &&
    caseItem.response_timer_minutes === null &&
    !caseItem.response_timer_set_at;
  const responseTimerExpired = !!caseItem.response_due_at && new Date(caseItem.response_due_at).getTime() <= now;

  return needsInitialTimer || responseTimerExpired;
}

export function useAppealConfig() {
  return useQuery({
    queryKey: ['terminal-appeal-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('terminal_appeal_config' as any)
        .select('is_enabled, updated_at, updated_by')
        .eq('id', true)
        .maybeSingle();
      if (error) throw error;
      return { is_enabled: Boolean((data as any)?.is_enabled), ...(data as any) };
    },
    staleTime: 5_000,
    refetchInterval: 15_000,
  });
}

export function useToggleAppealModule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      const { data, error } = await supabase.rpc('set_terminal_appeal_enabled' as any, { p_enabled: enabled });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, enabled) => {
      queryClient.invalidateQueries({ queryKey: ['terminal-appeal-config'] });
      queryClient.invalidateQueries({ queryKey: ['terminal-appeal-cases'] });
      toast.success(`Appeal module ${enabled ? 'enabled' : 'disabled'}`);
    },
    onError: (err: Error) => toast.error(`Appeal toggle failed: ${err.message}`),
  });
}

export function useAppealCases(filters?: { status?: string; search?: string }) {
  return useQuery({
    queryKey: ['terminal-appeal-cases', filters],
    queryFn: async () => {
      let query = supabase
        .from('terminal_appeal_cases' as any)
        .select('*')
        .order('appeal_started_at', { ascending: true });
      if (filters?.status && filters.status !== 'all') query = query.eq('status', filters.status);
      const { data, error } = await query;
      if (error) throw error;
      const cases = (data || []) as unknown as TerminalAppealCase[];
      const q = filters?.search?.trim().toLowerCase();
      const filtered = q
        ? cases.filter((c) => [c.order_number, c.counterparty_nickname, c.adv_no, c.binance_status, c.request_reason].some((v) => String(v || '').toLowerCase().includes(q)))
        : cases;
      const userIds = [...new Set(filtered.flatMap((c) => [c.requested_by, c.last_checked_in_by, c.response_timer_set_by]).filter(Boolean))] as string[];
      if (!userIds.length) return filtered;
      const { data: users } = await supabase.from('users').select('id, username, first_name, last_name').in('id', userIds);
      const userMap = new Map((users || []).map((u: any) => [u.id, u]));
      return filtered.map((c) => ({
        ...c,
        requester: c.requested_by ? userMap.get(c.requested_by) : null,
        checkedInBy: c.last_checked_in_by ? userMap.get(c.last_checked_in_by) : null,
        timerSetBy: c.response_timer_set_by ? userMap.get(c.response_timer_set_by) : null,
      }));
    },
    refetchInterval: 10_000,
    staleTime: 5_000,
  });
}

export function useAppealCaseEvents(caseId?: string | null) {
  return useQuery({
    queryKey: ['terminal-appeal-case-events', caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('terminal_appeal_case_events' as any)
        .select('*')
        .eq('case_id', caseId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const events = data || [];
      const userIds = [...new Set(events.map((e: any) => e.actor_user_id).filter(Boolean))] as string[];
      if (!userIds.length) return events;
      const { data: users } = await supabase.from('users').select('id, username, first_name, last_name').in('id', userIds);
      const userMap = new Map((users || []).map((u: any) => [u.id, u]));
      return events.map((e: any) => ({ ...e, actor: e.actor_user_id ? userMap.get(e.actor_user_id) : null }));
    },
    enabled: !!caseId,
  });
}

export function useRequestAppealFromSmallPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ caseId, reason }: { caseId: string; reason?: string }) => {
      const { data, error } = await supabase.rpc('request_terminal_appeal_from_small_payment' as any, {
        p_case_id: caseId,
        p_reason: reason || null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['terminal-appeal-cases'] });
      queryClient.invalidateQueries({ queryKey: ['small-payment-cases'] });
      toast.success('Appeal requested');
    },
    onError: (err: Error) => toast.error(`Appeal request failed: ${err.message}`),
  });
}

export function useUpsertAppealCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      orderNumber: string;
      source?: AppealSource;
      status?: AppealStatus;
      requestReason?: string | null;
      advNo?: string | null;
      tradeType?: string | null;
      asset?: string | null;
      fiatUnit?: string | null;
      totalPrice?: number | null;
      counterpartyNickname?: string | null;
      binanceStatus?: string | null;
    }) => {
      const { data, error } = await supabase.rpc('upsert_terminal_appeal_case' as any, {
        p_order_number: params.orderNumber,
        p_source: params.source || 'manual_request',
        p_status: params.status || 'requested',
        p_request_reason: params.requestReason || null,
        p_requested_from_case_id: null,
        p_adv_no: params.advNo || null,
        p_trade_type: params.tradeType || null,
        p_asset: params.asset || null,
        p_fiat_unit: params.fiatUnit || 'INR',
        p_total_price: params.totalPrice || null,
        p_counterparty_nickname: params.counterpartyNickname || null,
        p_binance_status: params.binanceStatus || null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['terminal-appeal-cases'] }),
  });
}

export function useSetAppealTimer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ caseId, minutes }: { caseId: string; minutes: number | null }) => {
      const { error } = await supabase.rpc('set_terminal_appeal_response_timer' as any, { p_case_id: caseId, p_minutes: minutes });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['terminal-appeal-cases'] });
      queryClient.invalidateQueries({ queryKey: ['terminal-appeal-case-events', vars.caseId] });
      toast.success('Response timer updated');
    },
    onError: (err: Error) => toast.error(`Timer update failed: ${err.message}`),
  });
}

export function useCheckInAppealCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ caseId, note }: { caseId: string; note?: string }) => {
      const { error } = await supabase.rpc('check_in_terminal_appeal_case' as any, { p_case_id: caseId, p_note: note || null });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['terminal-appeal-cases'] });
      queryClient.invalidateQueries({ queryKey: ['terminal-appeal-case-events', vars.caseId] });
      toast.success('Appeal checked in');
    },
    onError: (err: Error) => toast.error(`Check-in failed: ${err.message}`),
  });
}

export function useAddAppealNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ caseId, note }: { caseId: string; note: string }) => {
      const { error } = await supabase.rpc('add_terminal_appeal_note' as any, { p_case_id: caseId, p_note: note });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['terminal-appeal-cases'] });
      queryClient.invalidateQueries({ queryKey: ['terminal-appeal-case-events', vars.caseId] });
      toast.success('Appeal note added');
    },
    onError: (err: Error) => toast.error(`Note failed: ${err.message}`),
  });
}

export function useUpdateAppealStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ caseId, status, note }: { caseId: string; status: AppealStatus; note?: string }) => {
      const { error } = await supabase.rpc('update_terminal_appeal_status' as any, { p_case_id: caseId, p_status: status, p_note: note || null });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['terminal-appeal-cases'] });
      queryClient.invalidateQueries({ queryKey: ['terminal-appeal-case-events', vars.caseId] });
      toast.success('Appeal status updated');
    },
    onError: (err: Error) => toast.error(`Status update failed: ${err.message}`),
  });
}
