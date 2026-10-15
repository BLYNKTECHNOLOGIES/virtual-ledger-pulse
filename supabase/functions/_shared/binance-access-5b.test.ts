// AM-SEC-5b / 3b — follow-up gates, with mocked lookups and a mocked Binance.
import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { CHAT_READ_ACTIONS, checkAccountAccess, serviceOnlyDenial, type AccessDeps } from "./binance-access.ts";
import { AccountUnavailableError, pickAccountRow, type ExchangeAccountRow } from "./binance-account.ts";
import { handChangedFrom, type HandChangeRow } from "./adRest.ts";
import { gateDeliver } from "../payer-auto-screenshot/deliverGate.ts";

const BLYNK = "00000000-0000-0000-0000-000000000001";
const ASEC = "00000000-0000-0000-0000-000000000002";
const ACCOUNTS = [
  { id: BLYNK, account_name: "Blynk Binance", is_active: true, is_default: true },
  { id: ASEC, account_name: "ASEC Binance", is_active: true, is_default: false },
];
const ALLOWED: Record<string, string[]> = { defaultOnly: [BLYNK], asecOnly: [ASEC], both: [BLYNK, ASEC] };
const access = (): AccessDeps => ({ loadAccounts: async () => ACCOUNTS, allowedFor: async (u) => ALLOWED[u] ?? [] });

// ── 2. getChatCredential ────────────────────────────────────────────────────
/** Mirrors index.ts: service-only gate first, then the proxy call that adds _relay. */
function chatCredential(isServiceRole: boolean) {
  const calls: string[] = [];
  const denial = serviceOnlyDenial("getChatCredential", isServiceRole);
  if (denial) return { status: denial.status, body: denial.body as Record<string, unknown>, calls };
  calls.push("retrieveChatCredential");
  return { status: 200, body: { chatWssUrl: "wss://x", listenKey: "k", listenToken: "t", _relay: { relayUrl: "wss://r", relayToken: "PROXY" } } as Record<string, unknown>, calls };
}
Deno.test("getChatCredential: signed-in user → 403 SERVICE_ONLY, no Binance call, no relay token", () => {
  const r = chatCredential(false);
  assertEquals(r.status, 403);
  assertEquals(r.body.code, "SERVICE_ONLY");
  assertEquals(r.calls.length, 0);
  assert(!("_relay" in r.body));
});
Deno.test("getChatCredential: service role → ok, relay token returned (service role only)", () => {
  const r = chatCredential(true);
  assertEquals(r.status, 200);
  assertEquals((r.body._relay as { relayToken: string }).relayToken, "PROXY");
});
Deno.test("serviceOnlyDenial leaves every other action alone", () => {
  assertEquals(serviceOnlyDenial("getChatMessages", false), null);
  assertEquals(serviceOnlyDenial("sendChatMessage", false), null);
});

// ── 3. payer-auto-screenshot deliver ────────────────────────────────────────
async function deliver(user: string, perms: string[], account: string | null = null) {
  const sent: string[] = [];
  const g = await gateDeliver({ permissions: async () => new Set(perms), access: access() }, user, account);
  if (!g.ok) return { status: g.status, code: g.body.code, sent };
  sent.push("getChatImageUploadUrl", "PUT", "sendChatMessage");
  return { status: 200, code: "OK", sent };
}
Deno.test("payer deliver: no order-action right → 403, nothing uploaded or sent", async () => {
  const r = await deliver("both", ["terminal_orders_view"]);
  assertEquals([r.status, r.code, r.sent.length], [403, "PERMISSION_DENIED", 0]);
});
Deno.test("payer deliver: default account not allowed → 403 ACCOUNT_DENIED, nothing sent", async () => {
  const r = await deliver("asecOnly", ["terminal_orders_actions"]);
  assertEquals([r.status, r.code, r.sent.length], [403, "ACCOUNT_DENIED", 0]);
});
Deno.test("payer deliver: right + allowed account → sends", async () => {
  assertEquals((await deliver("both", ["terminal_orders_actions"])).status, 200);
  assertEquals((await deliver("defaultOnly", ["terminal_orders_manage"])).status, 200);
});
Deno.test("payer deliver: permission lookup error → 503, nothing sent", async () => {
  const g = await gateDeliver({ permissions: async () => { throw new Error("db"); }, access: access() }, "both");
  assertEquals(g.ok ? 200 : g.status, 503);
});

// ── 4. read markers ─────────────────────────────────────────────────────────
for (const action of CHAT_READ_ACTIONS) {
  Deno.test(`${action} on a not-allowed account → 403 ACCOUNT_DENIED`, async () => {
    const r = await checkAccountAccess(access(), "defaultOnly", [ASEC]);
    assertEquals(r.ok ? 200 : r.status, 403);
  });
  Deno.test(`${action} on an allowed account → ok`, async () => {
    assert((await checkAccountAccess(access(), "both", [ASEC])).ok);
  });
}

// ── 5. no fallback for an explicit account ──────────────────────────────────
const ROW = (id: string, active = true): ExchangeAccountRow => ({ id, account_name: id, credential_key: "default", is_default: id === BLYNK, is_active: active });
Deno.test("strict: lookup error for ASEC → refused, never Blynk", async () => {
  await assertRejects(() => pickAccountRow(ASEC, async (by) => by.id ? { row: null, error: "timeout" } : { row: ROW(BLYNK), error: null }, true), AccountUnavailableError);
});
Deno.test("strict: unknown or inactive id → refused", async () => {
  await assertRejects(() => pickAccountRow("nope", async (by) => by.id ? { row: null, error: null } : { row: ROW(BLYNK), error: null }, true), AccountUnavailableError);
  await assertRejects(() => pickAccountRow(ASEC, async () => ({ row: ROW(ASEC, false), error: null }), true), AccountUnavailableError);
});
Deno.test("strict: found → that very account", async () => {
  assertEquals((await pickAccountRow(ASEC, async () => ({ row: ROW(ASEC), error: null }), true)).id, ASEC);
});
Deno.test("strict with no id → default account (unchanged)", async () => {
  assertEquals((await pickAccountRow(null, async () => ({ row: ROW(BLYNK), error: null }), true)).id, BLYNK);
});
Deno.test("lenient read path keeps its old fallback", async () => {
  assertEquals((await pickAccountRow("nope", async (by) => by.id ? { row: null, error: null } : { row: ROW(BLYNK), error: null })).id, BLYNK);
});

// ── 6. hand-change rows honoured only from people who can switch ads ────────
const OP = "11111111-1111-1111-1111-111111111111";      // has Toggle
const KYC = "22222222-2222-2222-2222-222222222222";     // no Toggle / Manage
const BLYNK_ONLY = "33333333-3333-3333-3333-333333333333"; // has Toggle, Blynk only
const rows = (uid: string | null, adv: string): HandChangeRow => ({ adv_no: adv, metadata: {}, action_type: "ad.status_changed", user_id: uid });
Deno.test("hand-change row from a user without Toggle/Manage → ignored", () => {
  assertEquals([...handChangedFrom([rows(KYC, "A1")], ["A1"], new Set([OP]))], []);
});
Deno.test("hand-change row from an operator with Toggle → honoured", () => {
  assertEquals([...handChangedFrom([rows(OP, "A1")], ["A1"], new Set([OP]))], ["A1"]);
});
Deno.test("bulk row metadata.advNos honoured only for an allowed author", () => {
  const bulk = (uid: string): HandChangeRow => ({ adv_no: null, metadata: { advNos: ["A1", "A2"] }, action_type: "ad.bulk_status_changed", user_id: uid });
  assertEquals([...handChangedFrom([bulk(KYC)], ["A1", "A2"], new Set([OP]))], []);
  assertEquals([...handChangedFrom([bulk(OP)], ["A1", "A2"], new Set([OP]))].sort(), ["A1", "A2"]);
});
Deno.test("server row (no user id) → honoured", () => {
  assertEquals([...handChangedFrom([rows(null, "A1")], ["A1"], new Set())], ["A1"]);
});

// ── 5c-2. rights lookup failure → honour every row (fallback) ───────────────
Deno.test("allowedUserIds=null (lookup failed) → every row honoured", () => {
  const r = [rows(KYC, "A1"), rows(OP, "A2")];
  assertEquals([...handChangedFrom(r, ["A1", "A2"], null)].sort(), ["A1", "A2"]);
});

// ── 5c-3. account scoping: a Blynk-only author can't park an ASEC ad ────────
const ACC_BLYNK = "acc-blynk";
const ACC_ASEC  = "acc-asec";
const adAccount = new Map<string, string | null>([["A1", ACC_ASEC], ["A2", ACC_BLYNK]]);
const byUser = new Map<string, Set<string>>([
  [OP, new Set([ACC_BLYNK, ACC_ASEC])],
  [BLYNK_ONLY, new Set([ACC_BLYNK])],
]);
Deno.test("Blynk-only author on an ASEC ad → ignored", () => {
  assertEquals(
    [...handChangedFrom([rows(BLYNK_ONLY, "A1")], ["A1"], new Set([OP, BLYNK_ONLY]), adAccount, byUser)],
    [],
  );
});
Deno.test("Blynk-only author on a Blynk ad → honoured", () => {
  assertEquals(
    [...handChangedFrom([rows(BLYNK_ONLY, "A2")], ["A2"], new Set([OP, BLYNK_ONLY]), adAccount, byUser)],
    ["A2"],
  );
});
Deno.test("account lookup failed (byUser=null) → account check skipped", () => {
  assertEquals(
    [...handChangedFrom([rows(BLYNK_ONLY, "A1")], ["A1"], new Set([OP, BLYNK_ONLY]), adAccount, null)],
    ["A1"],
  );
});
Deno.test("server row (no user id) is never account-filtered", () => {
  assertEquals(
    [...handChangedFrom([rows(null, "A1")], ["A1"], new Set([OP]), adAccount, byUser)],
    ["A1"],
  );
});
