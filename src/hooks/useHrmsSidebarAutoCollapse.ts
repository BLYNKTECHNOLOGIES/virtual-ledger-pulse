import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";

const COOKIE_KEY = "hrms-sidebar:state";

type Mode = "auto" | "pinned";

export function readHrmsSidebarCookie(): boolean {
  if (typeof document === "undefined") return false;
  const v = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${COOKIE_KEY}=`))
    ?.split("=")[1];
  return v === "collapsed";
}

function writeCookie(collapsed: boolean) {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE_KEY}=${collapsed ? "collapsed" : "expanded"}; path=/; max-age=${60 * 60 * 24 * 365}`;
}

/**
 * HRMS mirror of `useSidebarAutoCollapse` (ERP / Terminal), driving the
 * HorillaLayout's own `collapsed` boolean:
 * - Interacting with / scrolling the work area collapses the rail.
 * - Hovering the rail peeks it open as an overlay (no page reflow).
 * - The manual Collapse button pins the choice until the next route change.
 * - Fully disabled on mobile.
 */
export function useHrmsSidebarAutoCollapse(
  workAreaRef: React.RefObject<HTMLElement>,
  collapsed: boolean,
  setCollapsed: (next: boolean) => void,
  options: { threshold?: number } = {},
) {
  const { threshold = 80 } = options;
  const isMobile = useIsMobile();
  const location = useLocation();

  const modeRef = useRef<Mode>("auto");
  const collapsedRef = useRef(collapsed);
  collapsedRef.current = collapsed;

  const [isPeeking, setIsPeeking] = useState(false);

  // Reset to auto mode on every route change.
  useEffect(() => {
    modeRef.current = "auto";
  }, [location.pathname]);

  const autoSet = useCallback(
    (nextCollapsed: boolean) => {
      if (modeRef.current !== "auto") return;
      if (collapsedRef.current === nextCollapsed) return;
      setCollapsed(nextCollapsed);
    },
    [setCollapsed],
  );

  /** Called by the manual Collapse button — pins the user's choice. */
  const pinToggle = useCallback(() => {
    modeRef.current = "pinned";
    setIsPeeking(false);
    const next = !collapsedRef.current;
    setCollapsed(next);
    writeCookie(next);
  }, [setCollapsed]);

  // Collapse on interaction with the work area + on scroll down.
  useEffect(() => {
    const el = workAreaRef.current;
    if (!el || isMobile) return;

    const collapse = () => {
      setIsPeeking(false);
      autoSet(true);
    };

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

  // Hover intent timers keep the rail from flickering as the pointer crosses.
  const hoverTimer = useRef<number>();
  const clearHoverTimer = () => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = undefined;
  };
  useEffect(() => clearHoverTimer, []);

  const expandOnHover = useCallback(() => {
    if (isMobile) return;
    clearHoverTimer();
    hoverTimer.current = window.setTimeout(() => {
      if (modeRef.current !== "auto" || !collapsedRef.current) return;
      setIsPeeking(true);
      autoSet(false);
    }, 90);
  }, [autoSet, isMobile]);

  const collapseOnLeave = useCallback(() => {
    if (isMobile) return;
    clearHoverTimer();
    hoverTimer.current = window.setTimeout(() => {
      autoSet(true);
      setIsPeeking(false);
    }, 200);
  }, [autoSet, isMobile]);

  return { expandOnHover, collapseOnLeave, isPeeking, pinToggle };
}
