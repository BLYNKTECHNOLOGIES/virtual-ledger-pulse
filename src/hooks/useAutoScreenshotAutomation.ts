import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface AutoScreenshotConfig {
  id: string;
  is_active: boolean;
  min_amount: number;
  max_amount: number;
  from_name: string;
  from_upi_id: string;
  provider_fee_flat: number;
  updated_at: string;
}

export interface AutoScreenshotLog {
  id: string;
  order_number: string;
  payer_user_id: string | null;
  payer_name: string | null;
  amount_used: number | null;
  provider_fee: number | null;
  total_debited: number | null;
  to_upi_id: string | null;
  upi_txn_id: string | null;
  status: string;
  error_message: string | null;
  image_url: string | null;
  created_at: string;
}

export function useAutoScreenshotConfig() {
  return useQuery({
    queryKey: ['auto-screenshot-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payer_screenshot_automation_config' as any)
        .select('*')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as AutoScreenshotConfig | null;
    },
  });
}

export function useUpdateAutoScreenshotConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<AutoScreenshotConfig> & { id: string }) => {
      const { id, ...rest } = patch;
      const { error } = await supabase
        .from('payer_screenshot_automation_config' as any)
        .update({ ...rest, updated_by: (await supabase.auth.getUser()).data.user?.id })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auto-screenshot-config'] });
      toast.success('Auto-screenshot settings saved');
    },
    onError: (e: any) => toast.error(`Save failed: ${e.message}`),
  });
}

export function useAutoScreenshotLog(limit = 50) {
  const qc = useQueryClient();

  useEffect(() => {
    const ch = supabase
      .channel('auto-screenshot-log')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payer_screenshot_automation_log' }, () => {
        qc.invalidateQueries({ queryKey: ['auto-screenshot-log'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  return useQuery({
    queryKey: ['auto-screenshot-log', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payer_screenshot_automation_log' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data || []) as unknown as AutoScreenshotLog[];
    },
    refetchInterval: 15_000,
  });
}
