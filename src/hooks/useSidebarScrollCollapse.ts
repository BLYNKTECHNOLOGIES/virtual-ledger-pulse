import { useEffect, useRef } from "react";
import { useSidebar } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";

/**
 * Auto-collapses the desktop sidebar to the icon rail while the user scrolls
 * down inside the main work area, and restores it when they scroll back to the
 * top. Manual toggles always win: if the user expands the sidebar while
 * scrolled down, we don't fight them until they return to the top.
 */
export function useSidebarScrollCollapse(
  scrollRef: React.RefObject<HTMLElement>,
  options: { threshold?: number } = {},
) {
  const { threshold = 80 } = options;
  const { open, setOpen, isMobile: ctxMobile } = useSidebar();
  const isMobile = useIsMobile() || ctxMobile;

  // Was the sidebar expanded before WE collapsed it?
  const autoCollapsedRef = useRef(false);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || isMobile) return;

    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = el.scrollTop;
        if (y > threshold) {
          if (openRef.current && !autoCollapsedRef.current) {
            autoCollapsedRef.current = true;
            setOpen(false);
          }
        } else if (y <= 4) {
          if (autoCollapsedRef.current) {
            autoCollapsedRef.current = false;
            setOpen(true);
          }
        }
      });
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [scrollRef, isMobile, setOpen, threshold]);

  // If the user manually re-opens while scrolled down, stop owning the state.
  useEffect(() => {
    if (open && autoCollapsedRef.current) {
      const el = scrollRef.current;
      if (el && el.scrollTop > threshold) autoCollapsedRef.current = false;
    }
  }, [open, scrollRef, threshold]);
}
