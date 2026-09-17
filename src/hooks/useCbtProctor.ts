import { useCallback, useEffect, useRef } from 'react';
import { cbtCall } from '@/lib/cbt/api';

type EventType =
  | 'fullscreen_exit'
  | 'tab_hidden'
  | 'window_blur'
  | 'paste_blocked'
  | 'copy_blocked'
  | 'shortcut_blocked'
  | 'burst_input'
  | 'resume';

/**
 * Records proctoring signals for a running attempt. Warning counting and
 * auto-submit live on the server (cbt-log-event); this hook only reports.
 */
export function useCbtProctor(opts: {
  active: boolean;
  onWarning: (count: number) => void;
  onAutoSubmitted: () => void;
  onNotice: (message: string) => void;
}) {
  const { active, onWarning, onAutoSubmitted, onNotice } = opts;
  const lastSent = useRef<Record<string, number>>({});

  const logEvent = useCallback(
    async (event_type: EventType, meta: Record<string, unknown> = {}) => {
      if (!active) return;
      // de-duplicate bursts of the same signal within 2 seconds
      const now = Date.now();
      if (now - (lastSent.current[event_type] ?? 0) < 2000) return;
      lastSent.current[event_type] = now;
      try {
        const res = await cbtCall<any>('cbt-log-event', { event_type, meta });
        if (res?.auto_submitted) {
          onAutoSubmitted();
          return;
        }
        if (res?.is_warning) onWarning(Number(res.warning_count ?? 0));
      } catch {
        // never block the candidate on a telemetry failure
      }
    },
    [active, onAutoSubmitted, onWarning],
  );

  useEffect(() => {
    if (!active) return;

    const onVisibility = () => {
      if (document.hidden) {
        onNotice('Leaving the test window is recorded as a warning.');
        void logEvent('tab_hidden');
      }
    };
    const onBlur = () => {
      onNotice('Switching away from the test window is recorded as a warning.');
      void logEvent('window_blur');
    };
    const onFullscreen = () => {
      if (!document.fullscreenElement) {
        onNotice('Leaving full screen is recorded as a warning.');
        void logEvent('fullscreen_exit');
      }
    };
    const onCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      void logEvent('copy_blocked');
    };
    const onContext = (e: MouseEvent) => e.preventDefault();
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const blocked =
        (e.ctrlKey || e.metaKey) && ['c', 'v', 'x', 'p', 's', 'u', 'f', 'a'].includes(k);
      if (blocked || k === 'f12') {
        e.preventDefault();
        void logEvent('shortcut_blocked', { key: k });
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    document.addEventListener('fullscreenchange', onFullscreen);
    document.addEventListener('copy', onCopy);
    document.addEventListener('contextmenu', onContext);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('fullscreenchange', onFullscreen);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('contextmenu', onContext);
      document.removeEventListener('keydown', onKey);
    };
  }, [active, logEvent, onNotice]);

  return { logEvent };
}
