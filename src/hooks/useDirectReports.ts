import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface DirectReport {
  employee_id: string;
  full_name: string | null;
  badge_id: string | null;
  designation: string | null;
  phone: string | null;
  is_active: boolean | null;
  pending_leave_with_me: number;
  pending_reg_with_me: number;
  pending_reg_with_hr: number;
}

/**
 * Direct reports of the signed-in employee, resolved server-side through
 * `hr_manager_direct_reports()` so reporting managers without HRMS access can
 * still see their team (and what is waiting on them) from the ERP profile.
 */
export function useDirectReports(enabled = true) {
  return useQuery({
    queryKey: ['ess_direct_reports'],
    queryFn: async (): Promise<DirectReport[]> => {
      const { data, error } = await (supabase as any).rpc('hr_manager_direct_reports');
      if (error) throw error;
      return (data || []) as DirectReport[];
    },
    enabled,
  });
}
