/**
 * Read hooks shared by more than one part of the profile page. Each keeps the
 * exact query key and query of the component that introduced it, so the
 * overview and the tabs read one cache instead of fetching twice.
 */
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { istToday } from './format';

/** ESS payslips (was inline in UserProfile's payslips tab). */
export function useMyPayslips(employeeId?: string | null, badgeId?: string | number | null) {
  // ESS reads its own payslips through a security-definer RPC (hr_my_payslips),
  // which resolves every HR employee row linked to the signed-in user (including
  // legacy/biometric duplicates sharing the same badge). Falls back to the
  // canonical view query if the RPC is unavailable.
  return useQuery({
    queryKey: ['ess_my_payslips', employeeId, badgeId],
    queryFn: async () => {
      const { data, error: rpcError } = await (supabase as any).rpc('hr_my_payslips');
      if (!rpcError && data) return data as any[];
      const { data: viaView, error: viewError } = await (supabase as any)
        .from('hr_payslips_v')
        .select('*')
        .eq('employee_id', employeeId)
        .order('period_month', { ascending: false });
      if (viewError) throw rpcError ?? viewError;
      return (viaView ?? []) as any[];
    },
  });
}

/** My attendance regularization requests (was inline in MyRequestsHub). */
export function useMyRegularizations(employeeId?: string | null) {
  return useQuery({
    queryKey: ['ess_hub_regs', employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hr_attendance_regularization_requests')
        .select('*')
        .eq('employee_id', employeeId as string)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!employeeId,
  });
}

/** Team leave requests waiting on me as reporting manager (was inline in TeamLeaveApprovals). */
export function useTeamLeaveQueue(employeeId?: string | null) {
  return useQuery({
    queryKey: ['ess_team_leave_approvals', employeeId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .rpc('hr_manager_leave_queue');
      if (error) throw error;
      return data || [];
    },
    enabled: !!employeeId,
  });
}

/**
 * Paid leave I can take today, per leave type, exactly as the database counts
 * it (hr_my_leave_available): earned balance in scope, minus requests still
 * waiting for a decision. Comp-off counts only this month's credits.
 */
export function useMyLeaveAvailable(employeeId?: string | null, leaveTypeIds: string[] = []) {
  const today = istToday();
  const ids = [...leaveTypeIds].sort();
  return useQuery({
    queryKey: ['ess_leave_available_today', employeeId, today, ids.join(',')],
    queryFn: async () => {
      // One type failing leaves that type unknown (null) instead of blanking the rest.
      const settled = await Promise.allSettled(ids.map(async (id) => {
        const { data, error } = await (supabase as any).rpc('hr_my_leave_available', {
          p_employee_id: employeeId, p_leave_type_id: id, p_start: today, p_end: today,
        });
        if (error) throw error;
        return Number(data ?? 0);
      }));
      if (settled.length > 0 && settled.every((r) => r.status === 'rejected')) {
        throw (settled[0] as PromiseRejectedResult).reason;
      }
      const out: Record<string, number | null> = {};
      settled.forEach((r, i) => { out[ids[i]] = r.status === 'fulfilled' ? r.value : null; });
      return out;
    },
    enabled: !!employeeId && ids.length > 0,
  });
}

/**
 * Everything a leave request, a cancellation or a decision can change on the
 * profile: the request lists, balances, team absences and the attendance days.
 */
export function invalidateLeaveCaches(qc: QueryClient, employeeId?: string | null) {
  for (const key of [
    ['hr_leave_requests', employeeId],
    ['ess_hub_leaves', employeeId],
    ['hr_leave_allocations', employeeId],
    ['ess_leave_available_today', employeeId],
    ['ess_leave_available', employeeId],
    ['ess_team_leave_window', employeeId],
    ['hr_attendance_month_summary_self', employeeId],
    ['hr_attendance_day_v1'],
  ]) {
    qc.invalidateQueries({ queryKey: key });
  }
}

export interface TeamMember {
  relation: 'manager' | 'colleague';
  employee_id: string;
  full_name: string | null;
  badge_id: string | null;
  position: string | null;
  phone: string | null;
  email: string | null;
}

/** My reporting manager and the active colleagues in my department (hr_my_team). */
export function useMyTeam(employeeId?: string | null) {
  return useQuery({
    queryKey: ['ess_my_team', employeeId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('hr_my_team');
      if (error) throw error;
      return (data || []) as TeamMember[];
    },
    enabled: !!employeeId,
  });
}

export interface TeamLeave {
  employee_id: string;
  full_name: string | null;
  relation: 'me' | 'manager' | 'report' | 'colleague';
  start_date: string;
  end_date: string;
  is_half_day: boolean | null;
  half_day_period: string | null;
  /** Only for my own leave and my direct reports'. */
  leave_type_name: string | null;
}

/** Approved leave in my team and department between two dates (hr_team_leave_window). */
export function useTeamLeaveWindow(employeeId: string | null | undefined, from: string, to: string) {
  return useQuery({
    queryKey: ['ess_team_leave_window', employeeId, from, to],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('hr_team_leave_window', { p_from: from, p_to: to });
      if (error) throw error;
      return (data || []) as TeamLeave[];
    },
    enabled: !!employeeId && !!from && !!to,
  });
}

/** Team regularizations HR pushed to me (was inline in TeamRegularizationApprovals). */
export function useTeamRegQueue(employeeId?: string | null) {
  return useQuery({
    queryKey: ['ess_team_reg_approvals', employeeId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .rpc('hr_manager_regularization_queue');
      if (error) throw error;
      return data || [];
    },
    enabled: !!employeeId,
  });
}
