import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY_PREFIX = 'terminal_prefs_';

/**
 * Per-user, per-page preference persistence for terminal settings.
 * Stores values in localStorage keyed by userId + page.
 */
export function useTerminalUserPrefs<T extends Record<string, unknown>>(
  userId: string | null | undefined,
  page: string,
  defaults: T
): [T, (key: keyof T, value: T[keyof T]) => void] {
  const storageKey = userId ? `${STORAGE_KEY_PREFIX}${userId}_${page}` : null;

  const readStored = useCallback((): T => {
    if (!storageKey) return defaults;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      // Merge with defaults so new keys get default values
      return { ...defaults, ...parsed };
    } catch {
      return defaults;
    }
  }, [storageKey]); // defaults is stable (caller should memoize or use const)

  const [prefs, setPrefs] = useState<T>(readStored);

  // Re-read when userId changes
  useEffect(() => {
    setPrefs(readStored());
  }, [readStored]);

  const setPref = useCallback(
    (key: keyof T, value: T[keyof T]) => {
      setPrefs(prev => {
        const next = { ...prev, [key]: value };
        if (storageKey) {
          try {
            localStorage.setItem(storageKey, JSON.stringify(next));
          } catch {
            // quota exceeded — ignore
          }
        }
        return next;
      });
    },
    [storageKey]
  );

  return [prefs, setPref];
}
