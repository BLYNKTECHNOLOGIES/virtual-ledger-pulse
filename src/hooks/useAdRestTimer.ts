import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { BINANCE_AD_STATUS, BinanceAd } from '@/hooks/useBinanceAds';
import { callBinanceAds } from '@/hooks/useBinanceActions';
import { useToast } from '@/hooks/use-toast';
import { AdActionTypes } from '@/hooks/useAdActionLog';

interface AdStatusSnapshot {
  advNo: string;
  advStatus: number; // 1=Online, 2=Private (status before the rest)
  accountId?: string | null;
}

interface RestTimer {
  id: string;
  started_at: string;
  duration_minutes: number;
  started_by: string | null;
  is_active: boolean;
  deactivated_ad_nos: string[];
  deactivated_ad_statuses: AdStatusSnapshot[] | null;
  start_completed_at?: string | null;
  ended_at?: string | null;
}

export interface RestAdOutcome {
  advNo: string;
  accountId: string | null;
  reason?: string;
  wasPrivate?: boolean;
}

export interface RestEndResult {
  logId?: string;
  at?: string;
  timer_id: string;
  mode: 'manual' | 'automatic';
  ended_by: string;
  restored: RestAdOutcome[];
  skipped: RestAdOutcome[];
  failed: RestAdOutcome[];
}

const DISMISSED_KEY = 'terminal_rest_end_notice_dismissed';
const shortNo = (n: string) => `…${String(n).slice(-8)}`;
export function describeOutcomes(list: RestAdOutcome[]): string {
  return list.map((f) => `${shortNo(f.advNo)}${f.wasPrivate ? ' (Private)' : ''}: ${f.reason || 'refused'}`).join('; ');
}

const BINANCE_BREAK_STORAGE_KEY = 'terminal_binance_break_detected';
const BINANCE_BREAK_EVENT = 'terminal-binance-break-detected';

export function markAdBreakDetected(message?: string) {
  const payload = { detectedAt: new Date().toISOString(), message: message || 'Binance break mode is active' };
  localStorage.setItem(BINANCE_BREAK_STORAGE_KEY, JSON.stringify(payload));
  window.dispatchEvent(new CustomEvent(BINANCE_BREAK_EVENT, { detail: payload }));
}

export function clearAdBreakDetected() {
  localStorage.removeItem(BINANCE_BREAK_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(BINANCE_BREAK_EVENT));
}

/** How long after the planned end before the banner offers "Resume ads now". */
const OVERDUE_MS = 3 * 60_000;

/**
 * `full` (Ads page only) also loads the last end result and ticks every 5 s.
 * The Terminal header uses the light form: active timer only, one re-render at the end time.
 */
export function useAdRestTimer({ full = false }: { full?: boolean } = {}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [detectedBreak, setDetectedBreak] = useState<{ detectedAt: string; message: string } | null>(() => {
    try {
      const stored = localStorage.getItem(BINANCE_BREAK_STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const syncDetectedBreak = () => {
      try {
        const stored = localStorage.getItem(BINANCE_BREAK_STORAGE_KEY);
        setDetectedBreak(stored ? JSON.parse(stored) : null);
      } catch {
        setDetectedBreak(null);
      }
    };

    window.addEventListener('storage', syncDetectedBreak);
    window.addEventListener(BINANCE_BREAK_EVENT, syncDetectedBreak);
    return () => {
      window.removeEventListener('storage', syncDetectedBreak);
      window.removeEventListener(BINANCE_BREAK_EVENT, syncDetectedBreak);
    };
  }, []);

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
      return data as unknown as RestTimer | null;
    },
    refetchInterval: 30_000,
  });

  // Latest rest and its end result (written by the server, manual or automatic).
  const { data: lastEnd } = useQuery({
    queryKey: ['ad-rest-last-end'],
    queryFn: async () => {
      const { data: latest } = await supabase
        .from('ad_rest_timer')
        .select('id, started_at, duration_minutes, is_active, deactivated_ad_nos, ended_at')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data: log } = await supabase
        .from('ad_action_logs')
        .select('id, created_at, metadata')
        .eq('action_type', AdActionTypes.AD_REST_ENDED)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const meta = (log?.metadata || null) as any;
      const result: RestEndResult | null = meta?.timer_id
        ? { ...meta, logId: log!.id, at: log!.created_at, restored: meta.restored || [], skipped: meta.skipped || [], failed: meta.failed || [] }
        : null;
      return { latest: latest as any, result };
    },
    refetchInterval: 15_000,
    enabled: full,
  });

  const [now, setNow] = useState(() => Date.now());
  const plannedEnd = activeTimer ? new Date(activeTimer.started_at).getTime() + activeTimer.duration_minutes * 60_000 : null;
  useEffect(() => {
    if (full) {
      const i = setInterval(() => setNow(Date.now()), 5_000);
      return () => clearInterval(i);
    }
    // Light form: re-render once when the rest's hour is over.
    if (!plannedEnd) return;
    const wait = plannedEnd - Date.now();
    if (wait <= 0) return;
    const t = setTimeout(() => setNow(Date.now()), Math.min(wait + 500, 2_147_000_000));
    return () => clearTimeout(t);
  }, [full, plannedEnd]);

  // Check if timer has expired
  const timerState = useMemo(() => {
    if (!activeTimer) return { isResting: false, remainingMs: 0, endTime: undefined as number | undefined };
    const endTime = new Date(activeTimer.started_at).getTime() + activeTimer.duration_minutes * 60_000;
    const remaining = endTime - now;
    return { isResting: remaining > 0, remainingMs: Math.max(0, remaining), endTime };
  }, [activeTimer, now]);

  // Hour is over but the server has not finished bringing the ads back yet.
  // (No client write here: ending + restoring is done once, on the server.)
  const isRestoring = useMemo(() => {
    if (activeTimer && !timerState.isResting) return true;
    const latest = lastEnd?.latest;
    if (!latest || latest.is_active || !(latest.deactivated_ad_nos?.length > 0) || !latest.ended_at) return false;
    const ended = lastEnd?.result?.timer_id === latest.id;
    // Ended (claimed) but no result logged yet; never shown long after it actually ended.
    return !ended && now - new Date(latest.ended_at).getTime() < OVERDUE_MS;
  }, [activeTimer, timerState.isResting, lastEnd, now]);

  // The hour is over, the timer is still active and the server has not ended it.
  const isRestoreOverdue = !!activeTimer && !!timerState.endTime && now - timerState.endTime > OVERDUE_MS;
  const isStarting = !!activeTimer && !activeTimer.start_completed_at;

  useEffect(() => {
    if (!isRestoring) return;
    const i = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['ad-rest-timer'] });
      queryClient.invalidateQueries({ queryKey: ['ad-rest-last-end'] });
    }, 10_000);
    return () => clearInterval(i);
  }, [isRestoring, queryClient]);

  const [dismissedId, setDismissedId] = useState<string | null>(() => localStorage.getItem(DISMISSED_KEY));
  const endNotice = useMemo(() => {
    const r = lastEnd?.result;
    if (!r?.logId || r.logId === dismissedId) return null;
    const recent = r.at ? now - new Date(r.at).getTime() < 15 * 60_000 : false;
    // Problems stay until dismissed; a clean result shows briefly.
    if (r.failed.length > 0 || recent) return r;
    return null;
  }, [lastEnd, dismissedId, now]);
  const dismissEndNotice = () => {
    const id = lastEnd?.result?.logId;
    if (!id) return;
    localStorage.setItem(DISMISSED_KEY, id);
    setDismissedId(id);
  };

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['ad-rest-timer'] });
    queryClient.invalidateQueries({ queryKey: ['ad-rest-last-end'] });
    queryClient.invalidateQueries({ queryKey: ['binance-ads'] });
  };

  // Start rest — the server switches each active ad (Online + Private) off on its own
  // account, records what actually went off, and starts the timer.
  const startRest = useMutation({
    // The server reads each ad's live state on Binance for these accounts.
    mutationFn: async ({ accountIds, userName }: { accountIds: string[]; userName?: string }) => {
      return await callBinanceAds('startAdRest', { userName, accountIds }) as {
        started: boolean; switchedOff: AdStatusSnapshot[]; failed: RestAdOutcome[]; unclear?: RestAdOutcome[]; unreadable?: RestAdOutcome[];
        endedDuringStart?: boolean; restoredAfterEnd?: RestAdOutcome[]; lostAfterEnd?: RestAdOutcome[];
      };
    },
    onSuccess: (res) => {
      refreshAll();
      const failed = res?.failed || [];
      const unreadable = res?.unreadable || [];
      const unreadText = unreadable.length
        ? ` Left as they are (${unreadable.length}): ${unreadable.map((u) => u.advNo === '*' ? (u.reason || 'account unreadable') : `${shortNo(u.advNo)}: ${u.reason || 'could not read its current state'}`).join('; ')}.`
        : '';
      const unclear = res?.unclear || [];
      const unclearText = unclear.length
        ? ` No clear answer from Binance for ${unclear.length} (${unclear.map((u) => shortNo(u.advNo)).join(', ')}) — they are kept in the rest and checked when it ends.`
        : '';
      if (res?.endedDuringStart) {
        const lost = res.lostAfterEnd || [];
        toast({
          title: 'Rest was ended while it was starting',
          description: `${(res.restoredAfterEnd || []).length} ads switched back on.${lost.length ? ` Still off ${lost.length}: ${describeOutcomes(lost)}.` : ''}`,
          variant: lost.length ? 'destructive' : undefined,
        });
        return;
      }
      if (!res?.started) {
        toast({ title: 'Rest not started', description: `Binance did not confirm any ad as switched off. ${describeOutcomes(failed)}`, variant: 'destructive' });
      } else if (failed.length) {
        toast({
          title: 'Rest started — some ads stayed on',
          description: `${res.switchedOff.length} ads switched off. Binance refused ${failed.length}: ${describeOutcomes(failed)}.${unclearText}${unreadText}`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Rest Mode Activated',
          description: `${res.switchedOff.length} ads switched off. They come back on by themselves in 1 hour.${unclearText}${unreadText}`,
          variant: unreadable.length || unclear.length ? 'destructive' : undefined,
        });
      }
    },
    onError: (e: Error) => {
      refreshAll();
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    },
  });

  // End rest early — same server path as the automatic end.
  const endRest = useMutation({
    mutationFn: async () => {
      if (!activeTimer) throw new Error('No active timer found');
      return await callBinanceAds('endAdRest', { timerId: activeTimer.id }) as
        (RestEndResult & { claimed: true }) | { claimed: false; reason: string };
    },
    onSuccess: (res: any) => {
      if (res?.claimed) clearAdBreakDetected();
      refreshAll();
      if (!res?.claimed && res?.starting) {
        toast({ title: 'Rest is still starting', description: res.reason });
        return;
      }
      if (!res?.claimed && res?.retryLater) {
        toast({ title: 'Rest not ended yet', description: res.reason, variant: 'destructive' });
        return;
      }
      if (!res?.claimed) {
        toast({ title: 'Rest already ended', description: res?.reason || 'Someone else ended this rest.' });
        return;
      }
      const failed: RestAdOutcome[] = res.failed || [];
      const skipped: RestAdOutcome[] = res.skipped || [];
      const parts = [`${(res.restored || []).length} ads back on.`];
      if (skipped.length) parts.push(`Left alone ${skipped.length}: ${describeOutcomes(skipped)}.`);
      if (failed.length) parts.push(`Still off ${failed.length}: ${describeOutcomes(failed)}.`);
      toast({ title: failed.length ? 'Rest ended — some ads still off' : 'Rest Ended', description: parts.join(' '), variant: failed.length ? 'destructive' : undefined });
    },
    onError: (e: Error) => {
      refreshAll();
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    },
  });

  return {
    activeTimer,
    isResting: timerState.isResting && !!activeTimer,
    isRestoring,
    isRestoreOverdue,
    isStarting,
    endNotice,
    dismissEndNotice,
    isBinanceBreakDetected: !!detectedBreak,
    detectedBreak,
    remainingMs: timerState.remainingMs,
    endTime: timerState.endTime,
    isLoading,
    startRest,
    endRest,
    clearDetectedBreak: clearAdBreakDetected,
  };
}
