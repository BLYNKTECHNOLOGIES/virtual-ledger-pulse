import { test, expect, Page } from "@playwright/test";
import {
  ORDERS_SESSION_KEY,
  readPageLoadStamp,
  restoreSupabaseSession,
  stampPageLoad,
} from "./support/session";

const BASE = process.env.E2E_BASE_URL || "http://localhost:8080";

/** Simulates the user leaving to another browser tab and coming back. */
async function switchAwayAndBack(page: Page) {
  const other = await page.context().newPage();
  await other.goto("about:blank");
  await other.bringToFront();
  await other.waitForTimeout(2500); // let token refresh / revalidation fire
  await page.bringToFront();
  await page.waitForTimeout(2500);
  await other.close();
}

test.describe("Terminal · tab-switch persistence", () => {
  test("SPA is not reloaded when returning from another browser tab", async ({ page }) => {
    const reloads: string[] = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) reloads.push(frame.url());
    });

    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    const before = await stampPageLoad(page);
    const navsBefore = reloads.length;

    await switchAwayAndBack(page);

    // A full page refresh would wipe the in-memory stamp and add a navigation.
    expect(await readPageLoadStamp(page)).toBe(before);
    expect(reloads.length).toBe(navsBefore);
  });

  test("open chat survives a tab switch (requires a signed-in session)", async ({
    context,
    page,
  }) => {
    const authed = await restoreSupabaseSession(context, page, BASE);
    test.skip(
      !authed,
      "No Supabase session injected — sign in via the preview to run this spec.",
    );

    await page.goto(`${BASE}/terminal/orders`, { waitUntil: "domcontentloaded" });

    const chatButton = page.getByRole("button", { name: "Chat", exact: true });
    await expect(chatButton).toBeVisible();
    await chatButton.click();

    const inbox = page.getByTestId("terminal-chat-inbox");
    await expect(inbox).toBeVisible();

    const before = await stampPageLoad(page);
    const persisted = await page.evaluate(
      (key) => window.sessionStorage.getItem(key),
      ORDERS_SESSION_KEY,
    );
    expect(persisted).toContain("showChatInbox");

    await switchAwayAndBack(page);

    // Chat workspace still mounted, no spinner, no remount.
    await expect(inbox).toBeVisible();
    expect(await readPageLoadStamp(page)).toBe(before);
    expect(page.url()).toContain("/terminal/orders");
  });

  test("chat state is restored after an explicit reload", async ({ context, page }) => {
    const authed = await restoreSupabaseSession(context, page, BASE);
    test.skip(!authed, "No Supabase session injected.");

    await page.goto(`${BASE}/terminal/orders`, { waitUntil: "domcontentloaded" });
    const chatButton = page.getByRole("button", { name: "Chat", exact: true });
    await expect(chatButton).toBeVisible();
    await chatButton.click();
    await expect(page.getByTestId("terminal-chat-inbox")).toBeVisible();

    await page.reload({ waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("terminal-chat-inbox")).toBeVisible();
  });
});
