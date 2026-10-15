// AM-SEC-4 / AM-SEC-6 — order-chat, verification and read-marker rights;
// background jobs accept only the service role or the scheduler secret.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { gateTerminalRight } from "./binance-access.ts";
import { isTrustedJobCaller } from "./require-scheduler.ts";

/** Mocked Binance: counts calls; the handler only calls it when the gate passes. */
function harness(perms: string[] | "error", trusted = false) {
  let binanceCalls = 0;
  const run = async (action: string, user: string | null = "u1") => {
    const gate = await gateTerminalRight(action, user, async () =>
      perms === "error" ? { data: null, error: { message: "boom" } } : { data: perms, error: null }, trusted);
    if (gate) return gate;
    binanceCalls++;
    return { status: 200, body: { success: true } };
  };
  return { run, calls: () => binanceCalls };
}

const VIEW_ONLY = ["terminal_orders_view"];

for (const action of ["sendChatMessage", "getChatImageUploadUrl"]) {
  Deno.test(`${action}: refused without Chat / Payer Manage, before Binance`, async () => {
    const h = harness(VIEW_ONLY);
    const r = await h.run(action);
    assertEquals(r.status, 403);
    assertEquals((r.body as any).code, "PERMISSION_DENIED");
    assert(String((r.body as any).error).includes("Chat"));
    assertEquals(h.calls(), 0);
  });
  Deno.test(`${action}: allowed for a chat-right holder`, async () => {
    const h = harness([...VIEW_ONLY, "terminal_orders_chat"]);
    assertEquals((await h.run(action)).status, 200);
    assertEquals(h.calls(), 1);
  });
  Deno.test(`${action}: allowed for a payer with only terminal_payer_manage`, async () => {
    const h = harness(["terminal_payer_manage"]);
    assertEquals((await h.run(action)).status, 200);
    assertEquals(h.calls(), 1);
  });
}

Deno.test("confirmOrderVerified: refused without Actions/Manage (chat right is not enough)", async () => {
  const h = harness([...VIEW_ONLY, "terminal_orders_chat"]);
  const r = await h.run("confirmOrderVerified");
  assertEquals(r.status, 403);
  assertEquals(h.calls(), 0);
});
Deno.test("confirmOrderVerified: allowed with terminal_orders_actions or _manage", async () => {
  for (const p of ["terminal_orders_actions", "terminal_orders_manage"]) {
    const h = harness([p]);
    assertEquals((await h.run("confirmOrderVerified")).status, 200);
  }
});

for (const action of ["markOrderMessagesRead", "markUserMessagesRead"]) {
  Deno.test(`${action}: no Terminal role → 403 before Binance`, async () => {
    const h = harness([]);
    const r = await h.run(action);
    assertEquals(r.status, 403);
    assertEquals(h.calls(), 0);
  });
  Deno.test(`${action}: allowed with terminal_orders_view`, async () => {
    const h = harness(VIEW_ONLY);
    assertEquals((await h.run(action)).status, 200);
  });
}

Deno.test("service role is trusted: no rights lookup needed", async () => {
  for (const a of ["sendChatMessage", "getChatImageUploadUrl", "confirmOrderVerified", "markOrderMessagesRead"]) {
    const h = harness("error", true);
    assertEquals((await h.run(a, null)).status, 200);
  }
});
Deno.test("rights lookup error → 503 fail closed, no Binance call", async () => {
  const h = harness("error");
  const r = await h.run("sendChatMessage");
  assertEquals(r.status, 503);
  assertEquals(h.calls(), 0);
});
Deno.test("no signed-in user → 401", async () => {
  const h = harness(["terminal_orders_chat"]);
  assertEquals((await h.run("sendChatMessage", null)).status, 401);
});
Deno.test("unrelated read actions are not gated here", async () => {
  const h = harness([]);
  assertEquals((await h.run("getOrderDetail")).status, 200);
});

// AM-SEC-6
const SRK = "service-key";
const req = (h: Record<string, string>) => new Request("https://x/fn", { method: "POST", headers: h });
Deno.test("job caller: no auth / public key / wrong secret → refused", async () => {
  const lookup = async () => "cron-secret";
  assertEquals(await isTrustedJobCaller(req({}), SRK, lookup), false);
  assertEquals(await isTrustedJobCaller(req({ apikey: "anon", Authorization: "Bearer anon" }), SRK, lookup), false);
  assertEquals(await isTrustedJobCaller(req({ "x-scheduler-secret": "nope" }), SRK, lookup), false);
  assertEquals(await isTrustedJobCaller(req({ "x-scheduler-secret": "x" }), SRK, async () => { throw new Error("db"); }), false);
  assertEquals(await isTrustedJobCaller(req({ "x-scheduler-secret": "x" }), SRK, async () => null), false);
});
Deno.test("job caller: service role or scheduler secret → accepted", async () => {
  const lookup = async () => "cron-secret";
  assert(await isTrustedJobCaller(req({ Authorization: `Bearer ${SRK}` }), SRK, lookup));
  assert(await isTrustedJobCaller(req({ "x-scheduler-secret": "cron-secret" }), SRK, lookup));
});
