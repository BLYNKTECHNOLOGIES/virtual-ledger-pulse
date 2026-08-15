import { useCallback, useState } from "react";

export type ViewMode = "cards" | "table";

const PREFIX = "hrms_view_mode_";

/**
 * Persisted per-page card/table view preference.
 */
export function useViewMode(pageId: string, initial: ViewMode = "cards"): [ViewMode, (v: ViewMode) => void] {
  const key = `${PREFIX}${pageId}`;

  const [mode, setMode] = useState<ViewMode>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === "table" || raw === "cards" ? raw : initial;
    } catch {
      return initial;
    }
  });

  const set = useCallback(
    (v: ViewMode) => {
      setMode(v);
      try {
        localStorage.setItem(key, v);
      } catch {
        // ignore quota errors
      }
    },
    [key]
  );

  return [mode, set];
}
