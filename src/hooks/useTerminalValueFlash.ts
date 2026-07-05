import { useEffect, useRef, useState } from "react";

/**
 * useTerminalValueFlash — ADDITIVE, presentation-only hook.
 *
 * Returns a scoped className (".t-flash-up" / ".t-flash-down") for ~600ms
 * whenever the observed numeric value CHANGES, based on direction. Never
 * flashes on initial mount. The class is removed after the animation so it
 * can re-trigger on the next change; it never loops and is reduced-motion
 * safe (the underlying CSS rule lives inside a prefers-reduced-motion block).
 *
 * This hook does NOT fetch, mutate, poll, or alter any data — it only watches
 * a value already delivered by existing state/props.
 */
export function useTerminalValueFlash(value: number | null | undefined): string {
  const prevRef = useRef(value);
  const mountedRef = useRef(false);
  const [flash, setFlash] = useState("");

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      prevRef.current = value;
      return;
    }
    const prev = prevRef.current;
    prevRef.current = value;

    if (value === prev || value == null || prev == null) return;
    if (value === prev) return;

    setFlash(value > prev ? "t-flash-up" : "t-flash-down");
    const timeout = window.setTimeout(() => setFlash(""), 600);
    return () => window.clearTimeout(timeout);
  }, [value]);

  return flash;
}

export default useTerminalValueFlash;
