import * as React from "react";

/**
 * Radix content rendered in a portal (Popover / DropdownMenu / Command lists)
 * sits OUTSIDE the dialog's react-remove-scroll lock, so the lock calls
 * preventDefault() on every wheel event and the list refuses to scroll with the
 * mouse wheel while a modal is open.
 *
 * This hook attaches a native non-passive wheel listener on the portal content
 * and performs the scroll manually on the nearest scrollable ancestor of the
 * event target, so wheel scrolling works with or without an active scroll lock.
 */
function normalizeDelta(e: WheelEvent) {
  const factor = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1;
  return { x: e.deltaX * factor, y: e.deltaY * factor };
}

function findScrollable(start: Element | null, root: HTMLElement): HTMLElement | null {
  let node: Element | null = start;
  while (node && node !== root.parentElement) {
    if (node instanceof HTMLElement) {
      const style = getComputedStyle(node);
      if (
        /(auto|scroll|overlay)/.test(style.overflowY) &&
        node.scrollHeight > node.clientHeight + 1
      ) {
        return node;
      }
    }
    node = node.parentElement;
  }
  return null;
}

export function usePortalWheelScroll<T extends HTMLElement>(
  forwardedRef: React.ForwardedRef<T>,
) {
  const cleanupRef = React.useRef<(() => void) | null>(null);

  return React.useCallback(
    (node: T | null) => {
      cleanupRef.current?.();
      cleanupRef.current = null;

      if (node) {
        const onWheel = (e: WheelEvent) => {
          if (e.ctrlKey) return;
          const scroller = findScrollable(e.target as Element | null, node);
          if (!scroller) return;
          const { x, y } = normalizeDelta(e);
          const beforeY = scroller.scrollTop;
          const beforeX = scroller.scrollLeft;
          scroller.scrollTop += y;
          if (x) scroller.scrollLeft += x;
          if (scroller.scrollTop !== beforeY || scroller.scrollLeft !== beforeX) {
            e.preventDefault();
            e.stopPropagation();
          }
        };
        node.addEventListener("wheel", onWheel, { passive: false });
        cleanupRef.current = () => node.removeEventListener("wheel", onWheel);
      }

      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) (forwardedRef as React.MutableRefObject<T | null>).current = node;
    },
    [forwardedRef],
  );
}
