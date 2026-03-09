import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTerminalAuth } from '@/hooks/useTerminalAuth';

const HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds
const OFFLINE_THRESHOLD_MS = 90_000; // 90 seconds without heartbeat = offline

export function useTerminalPresence() {
  const { userId } = useTerminalAuth();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sendHeartbeat = useCallback(async () => {
    if (!userId) return;
    await supabase
      .from('terminal_user_presence' as any)
      .upsert(
        {
          user_id: userId,
          last_seen_at: new Date().toISOString(),
          is_online: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );
  }, [userId]);

  const markOffline = useCallback(async () => {
    if (!userId) return;
    await supabase
      .from('terminal_user_presence' as any)
      .upsert(
        {
          user_id: userId,
          is_online: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    // Send initial heartbeat
    sendHeartbeat();

    // Set up interval
    intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    // Visibility change handler
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        sendHeartbeat();
      }
    };

    // Before unload handler
    const handleBeforeUnload = () => {
      // Use sendBeacon for reliability on tab close
      const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/terminal_user_presence?user_id=eq.${userId}`;
      const body = JSON.stringify({
        is_online: false,
        updated_at: new Date().toISOString(),
      });
      navigator.sendBeacon?.(url); // Best effort; RLS may block sendBeacon
      markOffline();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      markOffline();
    };
  }, [userId, sendHeartbeat, markOffline]);
}

export { OFFLINE_THRESHOLD_MS };
