import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Reads a transaction id from the URL (e.g. ?orderId=... or ?txId=...) and,
 * once the matching ClickableRow is rendered, scrolls it into view and applies
 * a brief highlight so deep links land on the exact transaction — not just the
 * tab/page. Polls for a short window because list data loads asynchronously.
 *
 * Pass the query-param keys this page understands. Optionally pass `ready`
 * (e.g. !isLoading) so polling only starts after data has loaded.
 */
export function useDeepLinkHighlight(paramKeys: string[], ready: boolean = true) {
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (!ready) return;

    let targetId: string | null = null;
    for (const key of paramKeys) {
      const v = searchParams.get(key);
      if (v) {
        targetId = v;
        break;
      }
    }
    if (!targetId) return;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 40; // ~6s at 150ms

    const tryHighlight = () => {
      if (cancelled) return;
      const el = document.getElementById(`tx-row-${targetId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('tx-deeplink-highlight');
        window.setTimeout(() => el.classList.remove('tx-deeplink-highlight'), 4000);
        // Clean the param so a refresh / re-render doesn't re-trigger.
        const next = new URLSearchParams(searchParams);
        paramKeys.forEach((k) => next.delete(k));
        setSearchParams(next, { replace: true });
        return;
      }
      attempts += 1;
      if (attempts < maxAttempts) {
        window.setTimeout(tryHighlight, 150);
      }
    };

    tryHighlight();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, searchParams]);
}
