import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

/**
 * Slim indeterminate progress bar pinned under the HRMS header.
 *
 * It starts on every in-shell navigation and completes shortly after the new
 * route paints — a low-cost "something is happening" cue that does not cover
 * content. Presentation-only; it reflects navigation, never data-write state.
 */
export function RouteProgressBar() {
  const { pathname } = useLocation();
  const [visible, setVisible] = useState(false);
  const [done, setDone] = useState(false);
  const [first, setFirst] = useState(true);

  useEffect(() => {
    if (first) {
      setFirst(false);
      return;
    }
    setDone(false);
    setVisible(true);
    // The new route element has painted by the time this microtask chain plus
    // one frame settles; hold briefly so the bar reads as a finished sweep.
    const finish = window.setTimeout(() => setDone(true), 220);
    const hide = window.setTimeout(() => setVisible(false), 520);
    return () => {
      window.clearTimeout(finish);
      window.clearTimeout(hide);
    };
  }, [pathname]);

  if (!visible) return null;

  return (
    <div className="relative h-0.5 w-full overflow-hidden bg-transparent" role="presentation">
      <div
        className="h-full bg-[#6C63FF] transition-[width,opacity] ease-out"
        style={{
          width: done ? "100%" : "72%",
          opacity: done ? 0 : 1,
          transitionDuration: done ? "260ms" : "600ms",
        }}
      />
    </div>
  );
}

export default RouteProgressBar;
