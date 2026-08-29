import { useCallback, useEffect, useRef } from "react";
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
  const { open, setOpen, isMobile: ctxMobile, toggleSidebar } = useSidebar();
  const isMobile = useIsMobile() || ctxMobile;

  const modeRef = useRef<Mode>("auto");
  const openRef = useRef(open);
  openRef.current = open;

  // Track manual trigger usage: wrap toggleSidebar is not possible from here,
  // so we detect manual toggles by watching `open` changes we didn't cause.
  const causedByAutoRef = useRef(false);
  useEffect(() => {
    if (!causedByAutoRef.current) {
      // A change in `open` not caused by us = manual toggle -> pin.
      modeRef.current = "pinned";
    }
    causedByAutoRef.current = false;
  }, [open]);

  const autoSet = useCallback(
    (next: boolean) => {
      if (modeRef.current !== "auto") return;
      if (openRef.current === next) return;
      causedByAutoRef.current = true;
      setOpen(next);
    },
    [setOpen],
  );

  // Reset to auto mode on every route change (work area remounts content).
  useEffect(() => {
    modeRef.current = "auto";
  }, [typeof window !== "undefined" ? window.location.pathname : null]);

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

  const expandOnHover = useCallback(() => autoSet(true), [autoSet]);
  const collapseOnLeave = useCallback(() => autoSet(false), [autoSet]);

  return { expandOnHover, collapseOnLeave, toggleSidebar };
}
