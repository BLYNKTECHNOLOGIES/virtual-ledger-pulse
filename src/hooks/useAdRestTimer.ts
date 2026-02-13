import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { BINANCE_AD_STATUS, BinanceAd } from '@/hooks/useBinanceAds';
import { callBinanceAds } from '@/hooks/useBinanceActions';
import { useToast } from '@/hooks/use-toast';

interface RestTimer {
  id: string;
  started_at: string;
  duration_minutes: number;
  started_by: string | null;
  is_active: boolean;
  deactivated_ad_nos: string[];
}

export function useAdRestTimer() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch active rest timer
  const { data: activeTimer, isLoading } = useQuery({
    queryKey: ['ad-rest-timer'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ad_rest_timer')
        .select('*')
        .eq('is_active', true)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as RestTimer | null;
    },
    refetchInterval: 30_000,
  });

  // Check if timer has expired
  const timerState = useMemo(() => {
    if (!activeTimer) return { isResting: false, remainingMs: 0 };
    const endTime = new Date(activeTimer.started_at).getTime() + activeTimer.duration_minutes * 60_000;
    const remaining = endTime - Date.now();
    return { isResting: remaining > 0, remainingMs: Math.max(0, remaining), endTime };
  }, [activeTimer]);

  // Auto-expire timer
  useEffect(() => {
    if (activeTimer && !timerState.isResting) {
      supabase
        .from('ad_rest_timer')
        .update({ is_active: false })
        .eq('id', activeTimer.id)
        .then(() => queryClient.invalidateQueries({ queryKey: ['ad-rest-timer'] }));
    }
  }, [activeTimer, timerState.isResting]);

  // Start rest — call API directly, no nested mutations
  const startRest = useMutation({
    mutationFn: async ({ onlineAds, userName }: { onlineAds: BinanceAd[]; userName?: string }) => {
      const advNos = onlineAds.map(a => a.advNo);

      // Deactivate all online ads via Binance API directly
      if (advNos.length > 0) {
        await callBinanceAds('updateAdStatus', { advNos, advStatus: BINANCE_AD_STATUS.OFFLINE });
      }

      // Store timer in DB
      const { error } = await supabase.from('ad_rest_timer').insert({
        started_by: userName || 'Operator',
        duration_minutes: 60,
        deactivated_ad_nos: advNos,
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ad-rest-timer'] });
      queryClient.invalidateQueries({ queryKey: ['binance-ads'] });
      toast({ title: 'Rest Mode Activated', description: 'All ads deactivated. 1-hour timer started.' });
    },
    onError: (e: Error) => {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    },
  });

  // End rest — call API directly, no nested mutations
  const endRest = useMutation({
    mutationFn: async () => {
      if (!activeTimer) throw new Error('No active timer found');

      // First, mark timer as inactive in DB
      const { error: dbError } = await supabase
        .from('ad_rest_timer')
        .update({ is_active: false })
        .eq('id', activeTimer.id);
      if (dbError) throw dbError;

      // Re-activate previously deactivated ads via Binance API directly
      const advNos = activeTimer.deactivated_ad_nos || [];
      if (advNos.length > 0) {
        try {
          await callBinanceAds('updateAdStatus', { advNos, advStatus: BINANCE_AD_STATUS.ONLINE });
        } catch (e) {
          console.warn('Failed to re-activate ads via Binance, timer was still ended:', e);
          toast({ title: 'Warning', description: 'Rest ended but some ads may need manual re-activation.', variant: 'destructive' });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ad-rest-timer'] });
      queryClient.invalidateQueries({ queryKey: ['binance-ads'] });
      toast({ title: 'Rest Ended', description: 'Ads re-activated successfully.' });
    },
    onError: (e: Error) => {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    },
  });

  return {
    activeTimer,
    isResting: timerState.isResting && !!activeTimer,
    remainingMs: timerState.remainingMs,
    endTime: timerState.endTime,
    isLoading,
    startRest,
    endRest,
  };
}
