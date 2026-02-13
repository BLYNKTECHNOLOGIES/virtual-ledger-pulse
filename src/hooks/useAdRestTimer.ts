import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUpdateAdStatus, useBinanceAdsList, BINANCE_AD_STATUS, BinanceAd } from '@/hooks/useBinanceAds';
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
  const updateStatus = useUpdateAdStatus();

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
    refetchInterval: 30_000, // Sync across users every 30s
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
      // Timer expired — mark inactive
      supabase
        .from('ad_rest_timer')
        .update({ is_active: false })
        .eq('id', activeTimer.id)
        .then(() => queryClient.invalidateQueries({ queryKey: ['ad-rest-timer'] }));
    }
  }, [activeTimer, timerState.isResting]);

  // Start rest
  const startRest = useMutation({
    mutationFn: async ({ onlineAds, userName }: { onlineAds: BinanceAd[]; userName?: string }) => {
      const advNos = onlineAds.map(a => a.advNo);

      // Deactivate all online ads via Binance API
      if (advNos.length > 0) {
        await new Promise<void>((resolve, reject) => {
          updateStatus.mutate(
            { advNos, advStatus: BINANCE_AD_STATUS.OFFLINE },
            { onSuccess: () => resolve(), onError: (e) => reject(e) }
          );
        });
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

  // End rest early
  const endRest = useMutation({
    mutationFn: async () => {
      if (!activeTimer) return;

      // First, mark timer as inactive in DB (this should always succeed)
      const { error: dbError } = await supabase
        .from('ad_rest_timer')
        .update({ is_active: false })
        .eq('id', activeTimer.id);
      if (dbError) throw dbError;

      // Then try to re-activate previously deactivated ads (best-effort)
      const advNos = activeTimer.deactivated_ad_nos || [];
      if (advNos.length > 0) {
        try {
          await new Promise<void>((resolve, reject) => {
            updateStatus.mutate(
              { advNos, advStatus: BINANCE_AD_STATUS.ONLINE },
              { onSuccess: () => resolve(), onError: (e) => reject(e) }
            );
          });
        } catch (e) {
          console.warn('Failed to re-activate ads via Binance, but timer was ended:', e);
          toast({ title: 'Timer Ended', description: 'Rest ended but some ads may need manual re-activation.', variant: 'destructive' });
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
