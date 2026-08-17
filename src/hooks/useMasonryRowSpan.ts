import { useCallback, useEffect, useRef, useState } from "react";

export const MASONRY_ROW_UNIT = 8; // px, must match [grid-auto-rows:8px] on the grid

/**
 * Measures a grid item's natural content height and returns the number of
 * 8px auto-rows it should span, so tiles pack tightly and no blank vertical
 * space is left under short widgets.
 */
export function useMasonryRowSpan<T extends HTMLElement = HTMLDivElement>(enabled = true) {
  const ref = useRef<T | null>(null);
  const [rowSpan, setRowSpan] = useState<number | undefined>(undefined);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const grid = el.closest("[data-masonry-grid]") as HTMLElement | null;
    const rowGap = grid ? parseFloat(getComputedStyle(grid).rowGap || "0") || 0 : 0;
    const height = el.getBoundingClientRect().height;
    if (!height) return;
    const span = Math.max(1, Math.ceil((height + rowGap) / (MASONRY_ROW_UNIT + rowGap)));
    setRowSpan(prev => (prev === span ? prev : span));
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setRowSpan(undefined);
      return;
    }
    const el = ref.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [enabled, measure]);

  return { ref, rowSpan, measure };
}
