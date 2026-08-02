import { useEffect, useRef, useCallback } from "react";

/**
 * Generic form-draft persistence for HRMS forms.
 *
 * Keeps an in-progress form snapshot in localStorage so a refresh, an accidental
 * close, or a chunk reload never destroys typed work. Drafts are namespaced,
 * versioned and expire after `ttlMs` (default 7 days).
 *
 * Usage:
 *   const { clearDraft } = useFormDraftPersistence(
 *     open ? `payroll-bulk:${kind}:${period}` : null, // null disables
 *     snapshotObject,
 *     (saved) => { restore each field },
 *   );
 *   // call clearDraft() after a successful submit
 */

const PREFIX = "hrms.formdraft.v1:";
const DEFAULT_TTL = 7 * 24 * 60 * 60 * 1000;

interface Options {
  /** Skip writing when the snapshot has nothing worth restoring. */
  isEmpty?: (value: unknown) => boolean;
  ttlMs?: number;
  /** Debounce for writes (ms). */
  debounceMs?: number;
}

export function readFormDraft<T>(key: string, ttlMs = DEFAULT_TTL): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.savedAt === "number" && Date.now() - parsed.savedAt > ttlMs) {
      localStorage.removeItem(PREFIX + key);
      return null;
    }
    return parsed.value as T;
  } catch {
    return null;
  }
}

export function clearFormDraft(key: string) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

export function useFormDraftPersistence<T>(
  key: string | null,
  value: T,
  apply: (saved: T) => void,
  options: Options = {},
) {
  const { isEmpty, ttlMs = DEFAULT_TTL, debounceMs = 300 } = options;
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const isEmptyRef = useRef(isEmpty);
  isEmptyRef.current = isEmpty;
  const hydratedFor = useRef<string | null>(null);

  // Hydrate once per key.
  useEffect(() => {
    if (!key) {
      hydratedFor.current = null;
      return;
    }
    if (hydratedFor.current === key) return;
    hydratedFor.current = key;
    const saved = readFormDraft<T>(key, ttlMs);
    if (saved !== null && saved !== undefined) applyRef.current(saved);
  }, [key, ttlMs]);

  // Persist (debounced) on every change, but only after hydration for this key.
  useEffect(() => {
    if (!key || hydratedFor.current !== key) return;
    const t = setTimeout(() => {
      try {
        if (isEmptyRef.current?.(value)) {
          localStorage.removeItem(PREFIX + key);
          return;
        }
        localStorage.setItem(PREFIX + key, JSON.stringify({ savedAt: Date.now(), value }));
      } catch {
        /* quota — best effort */
      }
    }, debounceMs);
    return () => clearTimeout(t);
  }, [key, value, debounceMs]);

  const clearDraft = useCallback(() => {
    if (key) clearFormDraft(key);
  }, [key]);

  return { clearDraft };
}
