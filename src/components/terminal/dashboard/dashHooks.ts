import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Presentation helpers for the Terminal Dashboard. They only decide how a state
 * is shown; they never read data or change when anything is read.
 */

/**
 * True once `ts` is at least `maxAgeMs` old (false while there is no timestamp).
 * Re-renders by itself at the moment the age is reached, so a badge can change
 * even when nothing else on the page does (for example while offline).
 */
export function useOlderThan(ts: number | null | undefined, maxAgeMs: number): boolean {
  const [, setTick] = useState(0);
  const old = ts ? Date.now() - ts >= maxAgeMs : false;
  useEffect(() => {
    if (!ts || old) return;
    const t = setTimeout(() => setTick((n) => n + 1), Math.max(0, ts + maxAgeMs - Date.now()) + 50);
    return () => clearTimeout(t);
  }, [ts, old, maxAgeMs]);
  return old;
}

/**
 * Keeps an error message and its Retry button on screen while the retry it
 * started is still running, so the button keeps keyboard focus and shows its
 * progress instead of disappearing under the pointer.
 * Returns [holding, startHold]; `holding` is true from the click until the reads settle.
 */
export function useRetryHold(busy: boolean): [boolean, () => void] {
  const [held, setHeld] = useState(false);
  const wasBusy = useRef(busy);
  useEffect(() => {
    if (wasBusy.current && !busy) setHeld(false);
    wasBusy.current = busy;
  }, [busy]);
  const start = useCallback(() => setHeld(true), []);
  return [held && busy, start];
}

/**
 * When a retry works, its message and button go away and the browser drops focus to the
 * page body; move it to `target` instead (a heading with tabIndex -1).
 */
export function useFocusAfterRetry(retrying: boolean, failed: boolean, target: RefObject<HTMLElement>) {
  const wasRetrying = useRef(retrying);
  useEffect(() => {
    if (wasRetrying.current && !retrying && !failed) {
      const active = document.activeElement;
      if (!active || active === document.body) target.current?.focus({ preventScroll: true });
    }
    wasRetrying.current = retrying;
  }, [retrying, failed, target]);
}
