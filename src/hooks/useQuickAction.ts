import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * Consume a `?quickAction=<value>` URL flag once and clear it.
 *
 * Used by keyboard-shortcut driven "open dialog" actions. The shortcut only
 * navigates and sets the flag; the page decides (behind its own permission
 * checks) whether to run `onTrigger`. Nothing here bypasses permissions.
 *
 * @param expected the quickAction value this page handles (e.g. "new")
 * @param onTrigger called once when the flag is present
 */
export function useQuickAction(expected: string, onTrigger: () => void) {
  const location = useLocation();
  const navigate = useNavigate();
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const value = params.get("quickAction");
    if (!value || value !== expected) return;

    // Guard against double-firing for the same navigation instance.
    const stamp = location.key + ":" + value;
    if (handledRef.current === stamp) return;
    handledRef.current = stamp;

    onTrigger();

    // Strip the flag so refresh/back doesn't re-trigger it.
    params.delete("quickAction");
    navigate(
      { pathname: location.pathname, search: params.toString() },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, location.key, expected]);
}
