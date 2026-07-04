import { useEffect, useRef, useState } from "react";

/**
 * useValueFlash — returns a className that briefly applies a CSS flash
 * animation whenever the observed value CHANGES (never on initial mount).
 *
 * ADDITIVE / OBSERVE-ONLY: this hook does not fetch, mutate, or alter any
 * data — it only watches a value already delivered by existing state/queries
 * and toggles a purely presentational class defined in src/index.css.
 *
 * Available variants (see index.css):
 *  - "value-flash": inline number/cell flash (1s)
 *  - "row-flash":   full-row flash (1.2s)
 *
 * The class is removed after the animation duration so it can re-trigger on
 * the next change. It never loops. Respects prefers-reduced-motion via the
 * global CSS reduced-motion block.
 */
const DURATIONS: Record<string, number> = {
  "value-flash": 1000,
  "row-flash": 1200,
};

export function useValueFlash(
  value: number | string | null | undefined,
  variant: "value-flash" | "row-flash" = "value-flash"
): string {
  const prevRef = useRef(value);
  const mountedRef = useRef(false);
  const [flashing, setFlashing] = useState(false);

  useEffect(() => {
    // Skip the very first run (initial mount / first data load).
    if (!mountedRef.current) {
      mountedRef.current = true;
      prevRef.current = value;
      return;
    }

    if (value === prevRef.current) return;
    prevRef.current = value;

    // Don't flash when transitioning from an "empty" initial value.
    if (value === null || value === undefined || value === "") return;

    setFlashing(true);
    const timeout = window.setTimeout(
      () => setFlashing(false),
      DURATIONS[variant]
    );
    return () => window.clearTimeout(timeout);
  }, [value, variant]);

  return flashing ? variant : "";
}

export default useValueFlash;
