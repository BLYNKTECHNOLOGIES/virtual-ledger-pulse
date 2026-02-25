import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function useExcludedAds() {
  return useQuery({
    queryKey: ['ad-automation-exclusions'],
    queryFn: async () => {
      const { data, error } = await supabase.from('ad_automation_exclusions').select('adv_no');
      if (error) throw error;
      return new Set((data || []).map(d => d.adv_no));
    },
    staleTime: 30_000,
  });
}

export function useToggleAdExclusion() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ advNo, exclude }: { advNo: string; exclude: boolean }) => {
      if (exclude) {
        const { error } = await supabase.from('ad_automation_exclusions').insert({ adv_no: advNo } as any);
        if (error && !error.message.includes('duplicate')) throw error;
      } else {
        const { error } = await supabase.from('ad_automation_exclusions').delete().eq('adv_no', advNo);
        if (error) throw error;
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['ad-automation-exclusions'] });
      toast({ title: vars.exclude ? 'Ad Excluded' : 'Exclusion Removed', description: `Ad ${vars.advNo.slice(-8)} ${vars.exclude ? 'excluded from' : 'included in'} automation.` });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}
