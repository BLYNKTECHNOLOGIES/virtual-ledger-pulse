/**
 * Wraps a refresh callback so bursts of realtime events (e.g. a "mark read"
 * that updates hundreds of chat rows at once) trigger at most one refresh per
 * `waitMs` — leading call runs immediately, one trailing call catches the rest.
 * Without this every row event re-ran the heavy inbox query on every open
 * screen and saturated the database.
 */
export function coalesceRefresh(fn: () => void, waitMs = 3000) {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const run = () => {
    last = Date.now();
    timer = null;
    fn();
  };
  const wrapped = () => {
    const since = Date.now() - last;
    if (since >= waitMs && !timer) return run();
    if (!timer) timer = setTimeout(run, Math.max(0, waitMs - since));
  };
  wrapped.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return wrapped;
}
