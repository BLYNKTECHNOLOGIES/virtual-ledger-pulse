/**
 * Optimistic Binance order status overrides.
 *
 * After a successful release call Binance's order-list endpoint can keep
 * returning the pre-release status (BUYER_PAYED) for a few seconds. The release
 * itself is already authoritative (the API returned success), so we record the
 * new status locally and merge it into the status resolution pipeline. The
 * override is discarded once the live feed reports an equal-or-more-advanced
 * status, or after a short TTL.
 */

import { useSyncExternalStore } from 'react';

const TTL_MS = 5 * 60 * 1000;

const overrides = new Map<string, { status: string; ts: number }>();
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version += 1;
  listeners.forEach((l) => l());
}

export function setOptimisticOrderStatus(orderNumber: string | number, status: string) {
  const key = String(orderNumber ?? '').trim();
  if (!key) return;
  overrides.set(key, { status: status.toUpperCase(), ts: Date.now() });
  emit();
}

export function clearOptimisticOrderStatus(orderNumber: string | number) {
  const key = String(orderNumber ?? '').trim();
  // Callers clear from inside render (status-merge memo); defer the notify so we
  // never trigger a store update during React's render phase.
  if (overrides.delete(key)) queueMicrotask(emit);
}


export function getOptimisticOrderStatus(orderNumber: string | number): string | undefined {
  const key = String(orderNumber ?? '').trim();
  const entry = overrides.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > TTL_MS) {
    overrides.delete(key);
    return undefined;
  }
  return entry.status;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Re-renders consumers whenever an optimistic status is added/removed. */
export function useOptimisticOrderStatusVersion(): number {
  return useSyncExternalStore(subscribe, () => version, () => version);
}
