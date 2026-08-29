import type { BrowserContext, Page } from "@playwright/test";

/**
 * Restores a Supabase session (cookies + localStorage) into the browser context
 * when the sandbox/CI injected one. Returns false when no session is available,
 * in which case authenticated specs should skip.
 */
export async function restoreSupabaseSession(
  context: BrowserContext,
  page: Page,
  baseURL: string,
): Promise<boolean> {
  const cookiesJson = process.env.LOVABLE_BROWSER_SUPABASE_COOKIES_JSON;
  const storageKey = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
  const sessionJson = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;

  if (!cookiesJson && !(storageKey && sessionJson)) return false;

  if (cookiesJson) {
    const cookies = JSON.parse(cookiesJson).map((c: Record<string, unknown>) => ({
      ...c,
      url: baseURL,
    }));
    await context.addCookies(cookies);
  }

  await page.goto(baseURL, { waitUntil: "domcontentloaded" });

  if (storageKey && sessionJson) {
    await page.evaluate(
      ([key, value]) => window.localStorage.setItem(key, value),
      [storageKey, sessionJson] as const,
    );
  }

  return true;
}

/**
 * Stamps a unique id on the current document. If the page ever performs a full
 * reload/navigation the stamp is lost, which is how the specs detect refreshes.
 */
export async function stampPageLoad(page: Page): Promise<string> {
  return page.evaluate(() => {
    const w = window as unknown as { __e2ePageLoadId?: string };
    w.__e2ePageLoadId = w.__e2ePageLoadId || Math.random().toString(36).slice(2);
    return w.__e2ePageLoadId;
  });
}

export async function readPageLoadStamp(page: Page): Promise<string | undefined> {
  return page.evaluate(
    () => (window as unknown as { __e2ePageLoadId?: string }).__e2ePageLoadId,
  );
}

export const ORDERS_SESSION_KEY = "terminal_orders_open_state";
