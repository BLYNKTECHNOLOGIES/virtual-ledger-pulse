import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface FindingsFilter {
  category?: string;
  severity?: string;
  status?: string;
  finding_type?: string;
  asset?: string;
}

export function useReconciliationFindings(filters: FindingsFilter = {}) {
  const queryClient = useQueryClient();

  const findingsQuery = useQuery({
    queryKey: ['reconciliation-findings', filters],
    queryFn: async () => {
      let query = supabase
        .from('reconciliation_findings')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (filters.category) query = query.eq('category', filters.category);
      if (filters.severity) query = query.eq('severity', filters.severity);
      if (filters.status) query = query.eq('status', filters.status);
      if (filters.finding_type) query = query.eq('finding_type', filters.finding_type);
      if (filters.asset) query = query.eq('asset', filters.asset);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const countsQuery = useQuery({
    queryKey: ['reconciliation-counts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reconciliation_findings')
        .select('category, severity, status');

      if (error) throw error;
      const items = data || [];
      
      const byCat: Record<string, number> = {};
      const bySev: Record<string, number> = {};
      let openCount = 0;

      for (const item of items) {
        byCat[item.category] = (byCat[item.category] || 0) + 1;
        bySev[item.severity] = (bySev[item.severity] || 0) + 1;
        if (item.status === 'open') openCount++;
      }

      return { byCategory: byCat, bySeverity: bySev, openCount, total: items.length };
    },
  });

  const updateFindingStatus = useMutation({
    mutationFn: async ({ id, status, feedback_note }: { id: string; status: string; feedback_note?: string }) => {
      const { error } = await supabase
        .from('reconciliation_findings')
        .update({
          status,
          feedback_at: new Date().toISOString(),
          feedback_note: feedback_note || null,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation-findings'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation-counts'] });
    },
  });

  return {
    findings: findingsQuery.data || [],
    isLoading: findingsQuery.isLoading,
    counts: countsQuery.data,
    countsLoading: countsQuery.isLoading,
    updateStatus: updateFindingStatus.mutate,
    refetch: () => {
      findingsQuery.refetch();
      countsQuery.refetch();
    },
  };
}
