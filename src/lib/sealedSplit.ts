/**
 * The 45-day rule, in one place: orders older than SEALED_WINDOW_MS are served from the
 * pre-computed half-hour buckets. Pure (no Supabase import) so the dashboard plan and
 * useOrderSummary share it.
 */
export const SEALED_WINDOW_MS = 45 * 24 * 60 * 60 * 1000;
export const BUCKET_MS = 30 * 60 * 1000;

/** Bucket-aligned sealed cutoff, stable for 30 minutes so caching works. */
export function getSealedCutoffMs(now: number = Date.now()): number {
  return Math.floor((now - SEALED_WINDOW_MS) / BUCKET_MS) * BUCKET_MS;
}
