import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTerminalAuth } from '@/hooks/useTerminalAuth';
import { toast } from 'sonner';

interface OperatorAssignment {
  id: string;
  operator_user_id: string;
  assignment_type: 'size_range' | 'ad_id';
  size_range_id: string | null;
  ad_id: string | null;
  is_active: boolean;
  assigned_by: string;
  created_at: string;
  size_range?: { id: string; name: string; min_amount: number; max_amount: number } | null;
  user?: { id: string; username: string; first_name: string | null; last_name: string | null } | null;
}

// Get operator assignments for a specific user
export function useOperatorAssignments(operatorUserId?: string | null) {
  return useQuery({
    queryKey: ['operator-assignments', operatorUserId],
    queryFn: async () => {
      let query = supabase
        .from('terminal_operator_assignments' as any)
        .select('*')
        .eq('is_active', true);
      if (operatorUserId) {
        query = query.eq('operator_user_id', operatorUserId);
      }
      const { data, error } = await query;
      if (error) throw error;

      const sizeRangeIds = (data || [])
        .filter((a: any) => a.size_range_id)
        .map((a: any) => a.size_range_id);

      let sizeRangeMap: Record<string, any> = {};
      if (sizeRangeIds.length > 0) {
        const { data: ranges } = await supabase
          .from('terminal_order_size_ranges')
          .select('id, name, min_amount, max_amount')
          .in('id', sizeRangeIds);
        if (ranges) {
          for (const r of ranges) sizeRangeMap[r.id] = r;
        }
      }

      return (data || []).map((a: any) => ({
        ...a,
        size_range: a.size_range_id ? sizeRangeMap[a.size_range_id] || null : null,
      })) as OperatorAssignment[];
    },
    enabled: true,
  });
}

// Get all operator assignments with user + range details (for admin management)
export function useAllOperatorAssignments() {
  return useQuery({
    queryKey: ['all-operator-assignments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('terminal_operator_assignments' as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;

      const userIds = [...new Set((data || []).map((a: any) => a.operator_user_id))];
      const sizeRangeIds = (data || []).filter((a: any) => a.size_range_id).map((a: any) => a.size_range_id);

      const [usersRes, rangesRes] = await Promise.all([
        userIds.length > 0
          ? supabase.from('users').select('id, username, first_name, last_name').in('id', userIds)
          : { data: [] },
        sizeRangeIds.length > 0
          ? supabase.from('terminal_order_size_ranges').select('id, name, min_amount, max_amount').in('id', sizeRangeIds)
          : { data: [] },
      ]);

      const userMap: Record<string, any> = {};
      for (const u of usersRes.data || []) userMap[u.id] = u;
      const rangeMap: Record<string, any> = {};
      for (const r of rangesRes.data || []) rangeMap[r.id] = r;

      return (data || []).map((a: any) => ({
        ...a,
        user: userMap[a.operator_user_id] || null,
        size_range: a.size_range_id ? rangeMap[a.size_range_id] || null : null,
      }));
    },
  });
}

export function useCreateOperatorAssignment() {
  const queryClient = useQueryClient();
  const { userId } = useTerminalAuth();

  return useMutation({
    mutationFn: async (params: {
      operator_user_id: string;
      assignment_type: 'size_range' | 'ad_id';
      size_range_id?: string;
      ad_id?: string;
    }) => {
      if (!userId) throw new Error('Not authenticated');
      const { error } = await supabase.from('terminal_operator_assignments' as any).insert({
        operator_user_id: params.operator_user_id,
        assignment_type: params.assignment_type,
        size_range_id: params.size_range_id || null,
        ad_id: params.ad_id || null,
        assigned_by: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Operator assignment created');
      queryClient.invalidateQueries({ queryKey: ['all-operator-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['operator-assignments'] });
    },
    onError: (err: Error) => toast.error(`Failed: ${err.message}`),
  });
}

export function useToggleOperatorAssignment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('terminal_operator_assignments' as any)
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-operator-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['operator-assignments'] });
    },
  });
}

export function useDeleteOperatorAssignment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('terminal_operator_assignments' as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Assignment removed');
      queryClient.invalidateQueries({ queryKey: ['all-operator-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['operator-assignments'] });
    },
    onError: (err: Error) => toast.error(`Failed: ${err.message}`),
  });
}
