/**
 * Read hooks shared by more than one part of the profile page. Each keeps the
 * exact query key and query of the component that introduced it, so the
 * overview and the tabs read one cache instead of fetching twice.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
