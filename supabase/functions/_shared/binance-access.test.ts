// AM-SEC-5 — account and permission gates with mocked lookups and a mocked Binance.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { adsRequestedAccounts, checkAccountAccess, type AccessDeps } from "./binance-access.ts";
import { gateAssetsRequest, type AssetsGateDeps } from "../binance-assets/accessGate.ts";

const BLYNK = "00000000-0000-0000-0000-000000000001";
const ASEC = "00000000-0000-0000-0000-000000000002";
const ACCOUNTS = [
  { id: BLYNK, account_name: "Blynk Binance", is_active: true, is_default: true },
  { id: ASEC, account_name: "ASEC Binance", is_active: true, is_default: false },
  { id: "dead", account_name: "Old", is_active: false, is_default: false },
];
const ALLOWED: Record<string, string[]> = {
  defaultOnly: [BLYNK],          // e.g. Ishank / Khurram (no mapping, not admin)
  both: [BLYNK, ASEC],           // the 27 mapped staff
  trader: [BLYNK, ASEC],
  viewer: [BLYNK, ASEC],
};
const PERMS: Record<string, string[]> = {
  trader: ["terminal_assets_view", "terminal_assets_manage"],
  viewer: ["terminal_assets_view"],
};

function accessDeps(fail = false): AccessDeps {
  return {
    loadAccounts: async () => { if (fail) throw new Error("db down"); return ACCOUNTS; },
    allowedFor: async (u) => ALLOWED[u] ?? [],
  };
}

/** Mock Binance: counts every call that would reach the proxy. */
function mockBinance() {
  const calls: string[] = [];
  return { calls, send: (what: string) => { calls.push(what); return { ok: true }; } };
}

/** binance-ads path: gate first, Binance only when allowed (mirrors index.ts). */
async function adsCall(user: string, action: string, payload: Record<string, unknown>, deps = accessDeps()) {
  const b = mockBinance();
  const req = adsRequestedAccounts(action, payload);
  if (req) {
    const r = await checkAccountAccess(deps, user, req);
    if (!r.ok) return { status: r.status, body: r.body, calls: b.calls };
  }
  b.send(action);
  return { status: 200, body: { success: true, error: "", code: "OK" }, calls: b.calls };
}

for (const [action, payload] of [
  ["updateAdStatus", { advNos: ["111"], advStatus: 3, exchange_account_id: ASEC }],
  ["releaseCoin", { orderNumber: "222", exchange_account_id: ASEC }],
  ["startAdRest", { accountIds: [BLYNK, ASEC] }],
] as const) {
  Deno.test(`ads: default-only user, ${action} on ASEC → 403 ACCOUNT_DENIED, nothing sent`, async () => {
    const r = await adsCall("defaultOnly", action, payload);
    assertEquals(r.status, 403);
    assertEquals(r.body.code, "ACCOUNT_DENIED");
    assertEquals((r.body as { error: string }).error, "You don't have access to the ASEC Binance account.");
    assertEquals(r.calls.length, 0);
  });
  Deno.test(`ads: user mapped to both accounts, ${action} on ASEC → allowed`, async () => {
    const r = await adsCall("both", action, payload);
    assertEquals(r.status, 200);
    assertEquals(r.calls, [action]);
  });
}

Deno.test("ads: unknown account id → refused, no fallback to default", async () => {
  const r = await adsCall("both", "updateAdStatus", { exchange_account_id: "11111111-2222-3333-4444-555555555555" });
  assertEquals(r.status, 403);
  assertEquals(r.body.code, "ACCOUNT_DENIED");
  assertEquals(r.calls.length, 0);
});

Deno.test("ads: inactive account id → refused", async () => {
  const r = await adsCall("both", "releaseCoin", { exchange_account_id: "dead" });
  assertEquals(r.status, 403);
  assertEquals(r.calls.length, 0);
});

Deno.test("ads: missing id means default account → allowed for default-only user", async () => {
  const r = await adsCall("defaultOnly", "updateAdStatus", {});
  assertEquals(r.status, 200);
  const rest = await adsCall("defaultOnly", "startAdRest", {});
  assertEquals(rest.status, 200);
});

Deno.test("ads: lookup error → 503, fail closed", async () => {
  const r = await adsCall("both", "updateAdStatus", { exchange_account_id: BLYNK }, accessDeps(true));
  assertEquals(r.status, 503);
  assertEquals(r.calls.length, 0);
});

Deno.test("ads: endAdRest is not account-limited (would leave ads off)", () => {
  assertEquals(adsRequestedAccounts("endAdRest", { exchange_account_id: ASEC }), null);
});

// ---------- binance-assets ----------
const SERVICE = "service-key";
function assetsDeps(): AssetsGateDeps {
  return {
    serviceRoleKey: SERVICE,
    userIdFromToken: async (t) => (t.startsWith("user:") ? t.slice(5) : null), // anon key → no user
    permissions: async (u) => new Set(PERMS[u] ?? []),
    access: accessDeps(),
  };
}
async function assetsCall(auth: string | null, action: string, payload: Record<string, unknown>) {
  const b = mockBinance();
  const g = await gateAssetsRequest(assetsDeps(), auth, action, payload);
  if (!g.ok) return { status: g.status, code: g.body.code, calls: b.calls };
  b.send(action);
  return { status: 200, code: "OK", calls: b.calls };
}
const TRADE = { symbol: "BTCUSDT", side: "BUY", quoteOrderQty: "10", dryRun: true, exchange_account_id: BLYNK };

Deno.test("assets: no Authorization → 401", async () => {
  const r = await assetsCall(null, "getBalances", {});
  assertEquals(r.status, 401);
  assertEquals(r.calls.length, 0);
});
Deno.test("assets: anon key as Bearer → 401", async () => {
  assertEquals((await assetsCall("Bearer anon-key", "getBalances", {})).status, 401);
});
Deno.test("assets: user without terminal_assets_manage, dry-run trade → 403, nothing sent", async () => {
  const r = await assetsCall("Bearer user:viewer", "executeTradeWithTransfer", TRADE);
  assertEquals(r.status, 403);
  assertEquals(r.code, "PERMISSION_DENIED");
  assertEquals(r.calls.length, 0);
});
Deno.test("assets: trader on an account they may not use → 403 ACCOUNT_DENIED", async () => {
  ALLOWED.traderBlynk = [BLYNK];
  PERMS.traderBlynk = ["terminal_assets_manage"];
  const r = await assetsCall("Bearer user:traderBlynk", "executeTradeWithTransfer", { ...TRADE, exchange_account_id: ASEC });
  assertEquals(r.code, "ACCOUNT_DENIED");
  assertEquals(r.calls.length, 0);
});
Deno.test("assets: trader with the right on an allowed account → allowed", async () => {
  const r = await assetsCall("Bearer user:trader", "executeTradeWithTransfer", { ...TRADE, exchange_account_id: ASEC });
  assertEquals(r.status, 200);
});
Deno.test("assets: read actions open to any signed-in staff; service role trusted", async () => {
  assertEquals((await assetsCall("Bearer user:viewer", "getBalances", { exchange_account_id: ASEC })).status, 200);
  const s = await gateAssetsRequest(assetsDeps(), `Bearer ${SERVICE}`, "getBalances", {});
  assert(s.ok && s.kind === "service");
});

// ---------- AM-SEC-2: rest needs the Rest Timer right ----------
import { adWriteDenial } from "./binance-access.ts";
const OPS_NO_REST = new Set(["terminal_ads_view", "terminal_ads_manage", "terminal_ads_toggle"]);
const WITH_REST = new Set(["terminal_ads_view", "terminal_ads_rest_timer"]);
for (const action of ["startAdRest", "endAdRest"]) {
  Deno.test(`ads: ${action} refused without terminal_ads_rest_timer (Manage + Toggle not enough)`, () => {
    const msg = adWriteDenial(action, OPS_NO_REST, false);
    assert(msg && msg.includes("'Rest Timer'"));
  });
  Deno.test(`ads: ${action} allowed with terminal_ads_rest_timer`, () => {
    assertEquals(adWriteDenial(action, WITH_REST, false), null);
  });
}
Deno.test("ads: automatic end (service role) unaffected — no rights needed", () => {
  assertEquals(adWriteDenial("endAdRest", new Set(), true), null);
});
Deno.test("ads: status switch still Toggle or Manage", () => {
  assertEquals(adWriteDenial("updateAdStatus", OPS_NO_REST, false), null);
  assert(adWriteDenial("updateAdStatus", WITH_REST, false));
});
