import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const SETTING_KEY = 'hybrid_price_difference_adjuster';

export function useHybridPriceAdjuster() {
  return useQuery({
    queryKey: ['system-setting', SETTING_KEY],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', SETTING_KEY)
        .maybeSingle();
      if (error) throw error;
      return parseFloat(data?.setting_value ?? '0') || 0;
    },
    staleTime: 60_000,
  });
}

export function useUpdateHybridPriceAdjuster() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (value: number) => {
      const { error } = await supabase
        .from('system_settings')
        .upsert({ setting_key: SETTING_KEY, setting_value: String(value) }, { onConflict: 'setting_key' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-setting', SETTING_KEY] });
    },
  });
}
