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
    // Use SECURITY DEFINER RPC to bypass any RLS issues
    const { error } = await supabase.rpc('terminal_heartbeat');
    if (error) {
      console.error('[Presence] Heartbeat RPC failed:', error.message);
    }
  }, [userId]);

  const markOffline = useCallback(async () => {
    if (!userId) return;
    const { error } = await supabase.rpc('mark_terminal_user_offline', { p_user_id: userId });
    if (error) {
      console.error('[Presence] Mark offline failed:', error.message);
    }
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
