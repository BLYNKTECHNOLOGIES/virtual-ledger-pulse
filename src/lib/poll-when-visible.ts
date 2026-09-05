/**
 * Polling helper — only poll while the tab is actually being looked at.
 *
 * Terminal pages run several live queries side by side (active orders, recent
 * history, stale-status recheck, monitor logs). All of them hit the same shared
 * Binance proxy. When those intervals keep firing in background tabs the proxy
 * queue saturates and the *visible* tab starts stuttering ("buffering").
 *
 * Passing `refetchInterval: pollWhenVisible(5000)` keeps the exact same cadence
 * while the operator is on the page and pauses it the moment the tab is hidden.
 * React Query re-evaluates the interval on focus, and `refetchOnWindowFocus`
 * gives an immediate refresh on return, so nothing goes stale.
 */
export function pollWhenVisible(ms: number) {
  return () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return false;
    return ms;
  };
}
