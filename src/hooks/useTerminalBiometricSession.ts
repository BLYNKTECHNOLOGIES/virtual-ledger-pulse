import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const SESSION_KEY = 'terminal_biometric_token';
const INACTIVITY_TIMEOUT_MS = 12 * 60 * 1000; // 12 minutes
const WARNING_BEFORE_MS = 2 * 60 * 1000; // warn 2 min before
const REVALIDATION_INTERVAL_MS = 2 * 60 * 1000; // re-check server every 2 min

interface BiometricSessionState {
  isAuthenticated: boolean;
  isLoading: boolean;
  sessionToken: string | null;
}

export function useTerminalBiometricSession(userId: string | null) {
  const [state, setState] = useState<BiometricSessionState>({
    isAuthenticated: false,
    isLoading: true,
    sessionToken: null,
  });

  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revalidationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const extendThrottleRef = useRef<number>(0);

  // Server-side session validation
  const validateServerSession = useCallback(async (token: string): Promise<boolean> => {
    if (!userId) return false;
    try {
      const { data } = await supabase.rpc('validate_terminal_biometric_session', {
        p_user_id: userId,
        p_token: token,
      });
      return !!data;
    } catch {
      return false;
    }
  }, [userId]);

  // Validate session on mount
  useEffect(() => {
    if (!userId) {
      setState({ isAuthenticated: false, isLoading: false, sessionToken: null });
      return;
    }

    const token = sessionStorage.getItem(SESSION_KEY);
    if (!token) {
      setState({ isAuthenticated: false, isLoading: false, sessionToken: null });
      return;
    }

    (async () => {
      const valid = await validateServerSession(token);
      if (valid) {
        setState({ isAuthenticated: true, isLoading: false, sessionToken: token });
      } else {
        sessionStorage.removeItem(SESSION_KEY);
        setState({ isAuthenticated: false, isLoading: false, sessionToken: null });
      }
    })();
  }, [userId, validateServerSession]);

  // Set session after successful auth
  const setSession = useCallback((token: string) => {
    sessionStorage.setItem(SESSION_KEY, token);
    setState({ isAuthenticated: true, isLoading: false, sessionToken: token });
  }, []);

  // Revoke session
  const revokeSession = useCallback(async () => {
    if (userId) {
      try {
        await supabase.rpc('revoke_terminal_biometric_session', { p_user_id: userId });
      } catch { /* ignore */ }
    }
    sessionStorage.removeItem(SESSION_KEY);
    setState({ isAuthenticated: false, isLoading: false, sessionToken: null });
  }, [userId]);

  // Extend session on activity (throttled to once per 60s)
  const extendSession = useCallback(async () => {
    const now = Date.now();
    if (now - extendThrottleRef.current < 60_000) return;
    extendThrottleRef.current = now;

    const token = sessionStorage.getItem(SESSION_KEY);
    if (!userId || !token) return;

    try {
      const { data: extended } = await supabase.rpc('extend_terminal_biometric_session', {
        p_user_id: userId,
        p_token: token,
      });
      // If extend failed (max lifetime exceeded or max extends hit), lock immediately
      if (!extended) {
        toast.error('Terminal session expired. Please re-authenticate.');
        sessionStorage.removeItem(SESSION_KEY);
        setState({ isAuthenticated: false, isLoading: false, sessionToken: null });
      }
    } catch { /* ignore */ }
  }, [userId]);

  // Periodic server-side re-validation (catches admin revocation, max lifetime expiry)
  useEffect(() => {
    if (!state.isAuthenticated || !state.sessionToken) return;

    revalidationTimerRef.current = setInterval(async () => {
      const token = sessionStorage.getItem(SESSION_KEY);
      if (!token) {
        setState({ isAuthenticated: false, isLoading: false, sessionToken: null });
        return;
      }
      const valid = await validateServerSession(token);
      if (!valid) {
        sessionStorage.removeItem(SESSION_KEY);
        setState({ isAuthenticated: false, isLoading: false, sessionToken: null });
        toast.error('Terminal session invalidated. Please re-authenticate.');
      }
    }, REVALIDATION_INTERVAL_MS);

    return () => {
      if (revalidationTimerRef.current) clearInterval(revalidationTimerRef.current);
    };
  }, [state.isAuthenticated, state.sessionToken, validateServerSession]);

  // Inactivity monitoring
  useEffect(() => {
    if (!state.isAuthenticated) return;

    const resetTimers = () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);

      warningTimerRef.current = setTimeout(() => {
        toast.warning('Terminal will lock in 2 minutes due to inactivity', { duration: 10000 });
      }, INACTIVITY_TIMEOUT_MS - WARNING_BEFORE_MS);

      inactivityTimerRef.current = setTimeout(() => {
        toast.error('Terminal locked due to inactivity');
        revokeSession();
      }, INACTIVITY_TIMEOUT_MS);

      extendSession();
    };

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'];
    events.forEach((e) => window.addEventListener(e, resetTimers, { passive: true }));
    resetTimers();

    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimers));
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    };
  }, [state.isAuthenticated, revokeSession, extendSession]);

  return {
    ...state,
    setSession,
    revokeSession,
  };
}
