import { useCallback, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useSidebar } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";

type Mode = "auto" | "pinned";

/**
 * Desktop sidebar auto-collapse system:
 * - Interacting with the main work area (click / tap / key input) or scrolling
 *   down collapses the sidebar to the icon rail.
 * - Hovering the sidebar (even the collapsed rail) expands it; leaving
 *   re-collapses it — but only while the collapse was automatic.
 * - Using the manual sidebar trigger pins the user's choice: the auto system
 *   stops touching state until the next route change resets it to "auto".
 */
export function useSidebarAutoCollapse(
  workAreaRef: React.RefObject<HTMLElement>,
  options: { threshold?: number } = {},
) {
  const { threshold = 80 } = options;
  const { open, setOpen, isMobile: ctxMobile } = useSidebar();
  const isMobile = useIsMobile() || ctxMobile;
  const location = useLocation();

  const modeRef = useRef<Mode>("auto");
  const openRef = useRef(open);
  openRef.current = open;

  // A change in `open` we didn't cause = manual toggle -> pin the sidebar.
  const causedByAutoRef = useRef(false);
  const firstOpenSync = useRef(true);
  useEffect(() => {
    if (firstOpenSync.current) {
      firstOpenSync.current = false;
      return;
    }
    if (!causedByAutoRef.current) {
      modeRef.current = "pinned";
    }
    causedByAutoRef.current = false;
  }, [open]);

  // Reset to auto mode on every route change.
  useEffect(() => {
    modeRef.current = "auto";
  }, [location.pathname]);

  const autoSet = useCallback(
    (next: boolean) => {
      if (modeRef.current !== "auto") return;
      if (openRef.current === next) return;
      causedByAutoRef.current = true;
      setOpen(next);
    },
    [setOpen],
  );

  // Collapse on interaction with the work area + on scroll down.
  useEffect(() => {
    const el = workAreaRef.current;
    if (!el || isMobile) return;

    const collapse = () => autoSet(false);

    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (el.scrollTop > threshold) collapse();
      });
    };

    el.addEventListener("pointerdown", collapse, { passive: true });
    el.addEventListener("keydown", collapse);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("pointerdown", collapse);
      el.removeEventListener("keydown", collapse);
      el.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [workAreaRef, isMobile, autoSet, threshold]);

  // Hover intent: small delays stop the rail from flickering when the pointer
  // just crosses the sidebar, and avoid an expand/collapse fight mid-animation.
  const hoverTimer = useRef<number>();
  const clearHoverTimer = () => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = undefined;
  };
  useEffect(() => clearHoverTimer, []);

  const expandOnHover = useCallback(() => {
    clearHoverTimer();
    hoverTimer.current = window.setTimeout(() => autoSet(true), 90);
  }, [autoSet]);

  const collapseOnLeave = useCallback(() => {
    clearHoverTimer();
    hoverTimer.current = window.setTimeout(() => autoSet(false), 220);
  }, [autoSet]);

  return { expandOnHover, collapseOnLeave };
}
