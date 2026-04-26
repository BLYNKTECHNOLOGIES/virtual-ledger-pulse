import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTerminalAuth } from '@/hooks/useTerminalAuth';
import { toast } from 'sonner';

export type SmallPaymentCaseStatus = 'open' | 'waiting_counterparty' | 'awaiting_refund' | 'ready_to_repay' | 'resolved' | 'closed' | 'cancelled' | 'appeal';
export type SmallPaymentCaseType = 'post_payment_followup' | 'alternate_upi_needed' | 'payment_not_received' | 'awaiting_refund' | 'invalid_upi' | 'unresponsive_counterparty' | 'appeal_risk' | 'other';

export interface SmallPaymentCase {
  id: string;
  order_number: string;
  case_type: SmallPaymentCaseType;
  status: SmallPaymentCaseStatus;
  payer_user_id: string | null;
  manager_user_id: string | null;
  marked_paid_at: string | null;
  opened_at: string;
  last_checked_at: string | null;
  last_contacted_at: string | null;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  notes: string | null;
  tags: string[];
  created_from: string;
  adv_no: string | null;
  total_price: number | null;
  asset: string | null;
  fiat_unit: string | null;
  counterparty_nickname: string | null;
  binance_status: string | null;
  created_at: string;
  updated_at: string;
  manager?: any;
  payer?: any;
}

export function useSmallPaymentCases(filters?: { mineOnly?: boolean; status?: string; caseType?: string }) {
  const { userId, hasPermission, isTerminalAdmin } = useTerminalAuth();
  return useQuery({
    queryKey: ['small-payment-cases', filters, userId],
    queryFn: async () => {
      let query = supabase
        .from('terminal_small_payment_cases' as any)
        .select('*')
        .order('opened_at', { ascending: false });

      if (filters?.mineOnly && userId && !isTerminalAdmin && !hasPermission('terminal_small_payments_manage')) {
        query = query.eq('manager_user_id', userId);
      }
      if (filters?.status && filters.status !== 'all') query = query.eq('status', filters.status);
      if (filters?.caseType && filters.caseType !== 'all') query = query.eq('case_type', filters.caseType);

      const { data, error } = await query;
      if (error) throw error;
      const cases = (data || []) as unknown as SmallPaymentCase[];
      const userIds = [...new Set(cases.flatMap((c) => [c.manager_user_id, c.payer_user_id]).filter(Boolean))] as string[];
      if (userIds.length === 0) return cases;
      const { data: users } = await supabase.from('users').select('id, username, first_name, last_name').in('id', userIds);
      const userMap = new Map((users || []).map((u: any) => [u.id, u]));
      return cases.map((c) => ({ ...c, manager: c.manager_user_id ? userMap.get(c.manager_user_id) : null, payer: c.payer_user_id ? userMap.get(c.payer_user_id) : null }));
    },
    refetchInterval: 10_000,
    staleTime: 5_000,
  });
}

export function useOpenSmallPaymentCases() {
  return useQuery({
    queryKey: ['open-small-payment-cases'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('terminal_small_payment_cases' as any)
        .select('*')
        .not('status', 'in', '(resolved,closed,cancelled)');
      if (error) throw error;
      return (data || []) as unknown as SmallPaymentCase[];
    },
    refetchInterval: 10_000,
    staleTime: 5_000,
  });
}

export function useUpsertSmallPaymentCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      orderNumber: string;
      caseType?: SmallPaymentCaseType;
      status?: SmallPaymentCaseStatus;
      payerUserId?: string | null;
      markedPaidAt?: string | null;
      createdFrom?: string;
      advNo?: string | null;
      totalPrice?: number | null;
      asset?: string | null;
      fiatUnit?: string | null;
      counterpartyNickname?: string | null;
      binanceStatus?: string | null;
      note?: string | null;
    }) => {
      const { data, error } = await supabase.rpc('upsert_terminal_small_payment_case' as any, {
        p_order_number: params.orderNumber,
        p_case_type: params.caseType || 'post_payment_followup',
        p_status: params.status || 'open',
        p_payer_user_id: params.payerUserId || null,
        p_marked_paid_at: params.markedPaidAt || null,
        p_created_from: params.createdFrom || 'manual',
        p_adv_no: params.advNo || null,
        p_total_price: params.totalPrice || null,
        p_asset: params.asset || null,
        p_fiat_unit: params.fiatUnit || 'INR',
        p_counterparty_nickname: params.counterpartyNickname || null,
        p_binance_status: params.binanceStatus || null,
        p_note: params.note || null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['small-payment-cases'] });
      queryClient.invalidateQueries({ queryKey: ['open-small-payment-cases'] });
    },
    onError: (err: Error) => toast.error(`Small payment case failed: ${err.message}`),
  });
}

export function useUpdateSmallPaymentCase() {
  const queryClient = useQueryClient();
  const { userId } = useTerminalAuth();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<SmallPaymentCase> }) => {
      const { error } = await supabase
        .from('terminal_small_payment_cases' as any)
        .update({ ...patch, updated_by: userId })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['small-payment-cases'] });
      queryClient.invalidateQueries({ queryKey: ['open-small-payment-cases'] });
      toast.success('Case updated');
    },
    onError: (err: Error) => toast.error(`Update failed: ${err.message}`),
  });
}

export function useUpdateSmallPaymentCaseStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, note }: { id: string; status: SmallPaymentCaseStatus; note?: string | null }) => {
      const { error } = await supabase.rpc('update_terminal_small_payment_case_status' as any, {
        p_case_id: id,
        p_status: status,
        p_note: note || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['small-payment-cases'] });
      queryClient.invalidateQueries({ queryKey: ['open-small-payment-cases'] });
      toast.success('Case status updated');
    },
    onError: (err: Error) => toast.error(`Status update failed: ${err.message}`),
  });
}

export function useSmallPaymentCaseEvents(caseId?: string | null) {
  return useQuery({
    queryKey: ['small-payment-case-events', caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('terminal_small_payment_case_events' as any)
        .select('*')
        .eq('case_id', caseId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!caseId,
  });
}

export function useLogSmallPaymentCaseEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ caseId, eventType, note, newValue }: { caseId: string; eventType: string; note?: string; newValue?: any }) => {
      const { error } = await supabase.rpc('log_terminal_small_payment_case_event' as any, {
        p_case_id: caseId,
        p_event_type: eventType,
        p_new_value: newValue || null,
        p_previous_value: null,
        p_note: note || null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['small-payment-case-events', vars.caseId] });
      queryClient.invalidateQueries({ queryKey: ['small-payment-cases'] });
      queryClient.invalidateQueries({ queryKey: ['open-small-payment-cases'] });
    },
  });
}

export function useAllSmallPaymentManagerAssignments() {
  return useQuery({
    queryKey: ['small-payment-manager-assignments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('terminal_small_payment_manager_assignments' as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = data || [];
      const userIds = [...new Set(rows.map((a: any) => a.manager_user_id).filter(Boolean))] as string[];
      const rangeIds = [...new Set(rows.map((a: any) => a.size_range_id).filter(Boolean))] as string[];
      const [usersRes, rangesRes] = await Promise.all([
        userIds.length ? supabase.from('users').select('id, username, first_name, last_name').in('id', userIds) : Promise.resolve({ data: [] as any[] }),
        rangeIds.length ? supabase.from('terminal_order_size_ranges').select('id, name, min_amount, max_amount').in('id', rangeIds) : Promise.resolve({ data: [] as any[] }),
      ]);
      const users = new Map((usersRes.data || []).map((u: any) => [u.id, u]));
      const ranges = new Map((rangesRes.data || []).map((r: any) => [r.id, r]));
      return rows.map((a: any) => ({ ...a, user: users.get(a.manager_user_id), size_range: a.size_range_id ? ranges.get(a.size_range_id) : null }));
    },
  });
}

export function useCreateSmallPaymentManagerAssignment() {
  const queryClient = useQueryClient();
  const { userId } = useTerminalAuth();
  return useMutation({
    mutationFn: async (params: { manager_user_id: string; assignment_type: 'size_range' | 'ad_id'; size_range_id?: string; ad_id?: string }) => {
      const { error } = await supabase.from('terminal_small_payment_manager_assignments' as any).insert({
        manager_user_id: params.manager_user_id,
        assignment_type: params.assignment_type,
        size_range_id: params.assignment_type === 'size_range' ? params.size_range_id : null,
        ad_id: params.assignment_type === 'ad_id' ? params.ad_id : null,
        assigned_by: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Small Payments assignment created');
      queryClient.invalidateQueries({ queryKey: ['small-payment-manager-assignments'] });
    },
    onError: (err: Error) => toast.error(`Assignment failed: ${err.message}`),
  });
}

export function useToggleSmallPaymentManagerAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('terminal_small_payment_manager_assignments' as any).update({ is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['small-payment-manager-assignments'] }),
  });
}

export function useDeleteSmallPaymentManagerAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('terminal_small_payment_manager_assignments' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Assignment removed');
      queryClient.invalidateQueries({ queryKey: ['small-payment-manager-assignments'] });
    },
  });
}

export function getUserName(user: any) {
  if (!user) return '—';
  if (user.first_name || user.last_name) return `${user.first_name || ''} ${user.last_name || ''}`.trim();
  return user.username || '—';
}

export function getCaseAgeMinutes(c: Pick<SmallPaymentCase, 'marked_paid_at' | 'opened_at'>) {
  const start = new Date(c.marked_paid_at || c.opened_at).getTime();
  return Math.max(0, Math.floor((Date.now() - start) / 60000));
}

export function formatCaseAge(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return `${hours}h ${mins}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}