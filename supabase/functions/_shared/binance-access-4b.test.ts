// AM-SEC-4b — auto-reply caller gate; live chat/counterparty reads need a Terminal right + account.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { gateTerminalRight, checkAccountAccess, CHAT_READ_ACTIONS, serverCaptureSource, type AccessDeps } from "./binance-access.ts";
import { gateAutoReplyCaller, type AutoReplyGateDeps } from "../auto-reply-engine/callerGate.ts";

const BLYNK = "00000000-0000-0000-0000-000000000001";
const ASEC = "00000000-0000-0000-0000-000000000002";
const access = (allowed: string[], fail = false): AccessDeps => ({
  loadAccounts: async () => { if (fail) throw new Error("db"); return [
    { id: BLYNK, account_name: "Blynk Binance", is_active: true, is_default: true },
    { id: ASEC, account_name: "ASEC Binance", is_active: true, is_default: false }]; },
  allowedFor: async () => allowed,
});
const ORDERS: Record<string, string> = { O1: BLYNK, O2: ASEC };

function arHarness(perms: string[] | "error", allowed = [BLYNK], orderFail = false) {
  let binance = 0;
  const deps: AutoReplyGateDeps = {
    permissions: async () => { if (perms === "error") throw new Error("x"); return new Set(perms); },
    orderAccount: async (o) => { if (orderFail) throw new Error("x"); return ORDERS[o] ?? null; },
    access: access(allowed),
  };
  const run = async (kind: "user" | "service" | "scheduler", order: string | null, uid: string | null = "u") => {
    const g = await gateAutoReplyCaller(deps, kind, uid, order);
    if (!g.ok) return g;
    binance++; return { ok: true as const, status: 200 };
  };
  return { run, calls: () => binance };
}

Deno.test("auto-reply: user without chat/payer-manage → 403, no Binance", async () => {
  const h = arHarness(["terminal_orders_view"]);
  const r = await h.run("user", "O1");
  assertEquals((r as any).status, 403); assertEquals((r as any).body.code, "PERMISSION_DENIED"); assertEquals(h.calls(), 0);
});
Deno.test("auto-reply: allowed user, order on not-allowed account → ACCOUNT_DENIED", async () => {
  const h = arHarness(["terminal_orders_chat"], [BLYNK]);
  const r = await h.run("user", "O2");
  assertEquals((r as any).body.code, "ACCOUNT_DENIED"); assertEquals(h.calls(), 0);
});
Deno.test("auto-reply: unknown order → refused", async () => {
  const h = arHarness(["terminal_orders_chat"]);
  assertEquals(((await h.run("user", "NOPE")) as any).body.code, "ACCOUNT_DENIED"); assertEquals(h.calls(), 0);
});
Deno.test("auto-reply: lookups fail → 503", async () => {
  assertEquals(((await arHarness("error").run("user", "O1")) as any).status, 503);
  assertEquals(((await arHarness(["terminal_orders_chat"], [BLYNK], true).run("user", "O1")) as any).status, 503);
});
Deno.test("auto-reply: user full poll refused", async () => {
  const h = arHarness(["terminal_orders_chat"]);
  assertEquals(((await h.run("user", null)) as any).status, 403);
});
Deno.test("auto-reply: payer-manage only, chat holder, service, scheduler → allowed", async () => {
  assertEquals((await arHarness(["terminal_payer_manage"]).run("user", "O1")).status, 200);
  assertEquals((await arHarness(["terminal_orders_chat"], [BLYNK, ASEC]).run("user", "O2")).status, 200);
  assertEquals((await arHarness("error").run("service", null, null)).status, 200);
  assertEquals((await arHarness("error").run("scheduler", null, null)).status, 200);
});

const READS = ["getChatMessages", "syncOrderChatMessages", "queryCounterPartyStats", "getUserOrderSummary"];
async function adsRead(action: string, perms: string[] | "error", allowed: string[], acct: string | null, trusted = false) {
  let binance = 0;
  const g = await gateTerminalRight(action, trusted ? null : "u", async () =>
    perms === "error" ? { data: null, error: { message: "x" } } : { data: perms, error: null }, trusted);
  if (g) return { status: g.status, code: g.body.code, binance };
  if (!trusted && CHAT_READ_ACTIONS.has(action)) {
    const a = await checkAccountAccess(access(allowed), "u", [acct]);
    if (!a.ok) return { status: a.status, code: a.body.code, binance };
  }
  binance++; return { status: 200, code: "OK", binance };
}
for (const a of READS) {
  Deno.test(`${a}: no Terminal role → 403 before Binance`, async () => {
    const r = await adsRead(a, [], [BLYNK], BLYNK); assertEquals(r.status, 403); assertEquals(r.binance, 0);
  });
  Deno.test(`${a}: viewer on not-allowed account → 403 ACCOUNT_DENIED`, async () => {
    const r = await adsRead(a, ["terminal_orders_view"], [BLYNK], ASEC); assertEquals(r.code, "ACCOUNT_DENIED"); assertEquals(r.binance, 0);
  });
  Deno.test(`${a}: lookup error → 503`, async () => {
    assertEquals((await adsRead(a, "error", [BLYNK], BLYNK)).status, 503);
  });
  Deno.test(`${a}: view or chat holder on allowed account, service role → allowed`, async () => {
    assertEquals((await adsRead(a, ["terminal_orders_view"], [BLYNK], BLYNK)).status, 200);
    assertEquals((await adsRead(a, ["terminal_orders_chat"], [BLYNK, ASEC], ASEC)).status, 200);
    assertEquals((await adsRead(a, "error", [], ASEC, true)).status, 200);
  });
}
Deno.test("syncOrderChatMessages: forged captureSource from a user stored as server label", () => {
  assertEquals(serverCaptureSource("listener_ws", false), "history_sync");
  assertEquals(serverCaptureSource("sweep_backstop", true), "sweep_backstop");
  assertEquals(serverCaptureSource("evil", true), "history_sync");
  assert(CHAT_READ_ACTIONS.has("syncOrderChatMessages"));
});
