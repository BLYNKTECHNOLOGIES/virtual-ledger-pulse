import { lazy as reactLazy, type ComponentType } from 'react';

const RELOAD_FLAG = 'lazy-chunk-reloaded';

/**
 * Drop-in replacement for React.lazy that recovers from stale chunk imports.
 *
 * After a new deployment, a client running the old index.html may request
 * hashed chunk files that no longer exist, producing
 * "Importing a module script failed" / "Failed to fetch dynamically imported
 * module". When that happens we force a one-time hard reload so the browser
 * fetches the fresh index + chunk manifest. The sessionStorage flag prevents
 * an infinite reload loop if the failure is genuine.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): React.LazyExoticComponent<T> {
  return reactLazy(async () => {
    try {
      const mod = await factory();
      // Successful import — clear the guard for future deployments.
      window.sessionStorage.removeItem(RELOAD_FLAG);
      return mod;
    } catch (err) {
      const alreadyReloaded = window.sessionStorage.getItem(RELOAD_FLAG);
      if (!alreadyReloaded) {
        window.sessionStorage.setItem(RELOAD_FLAG, '1');
        window.location.reload();
        // Return a never-resolving promise so nothing renders before reload.
        return new Promise<{ default: T }>(() => {});
      }
      throw err;
    }
  });
}
