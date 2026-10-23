import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { manualPricingGate, restStartOptions } from "../_shared/automationGate.ts";
Deno.test("pricing user without manage gets 403 before claim", async () => {
  let claims = 0;
  const d = await manualPricingGate("user", "u", "r", async () => false, async () => { claims++; return "claimed"; });
  assertEquals(d?.status, 403); assertEquals(claims, 0);
});
Deno.test("paused manual rule returns 409 before background acknowledgement", async () => {
  assertEquals((await manualPricingGate("user", "u", "r", async () => true, async () => "paused"))?.status, 409);
});
Deno.test("second manual claim inside 60 seconds returns 429", async () => {
  let claims = 0; const claim = async () => ++claims === 1 ? "claimed" : "rate_limited";
  assertEquals(await manualPricingGate("user", "u", "r", async () => true, claim), null);
  assertEquals((await manualPricingGate("user", "u", "r", async () => true, claim))?.status, 429);
});
Deno.test("cron/service paths never consume manual cooldown", async () => {
  let calls = 0;
  for (const kind of ["service", "scheduler"] as const) assertEquals(await manualPricingGate(kind, null, null, async () => { calls++; return false; }, async () => { calls++; return "paused"; }), null);
  assertEquals(calls, 0);
});
Deno.test("personal rest ignores forged schedule duration and ownership", () => {
  assertEquals(restStartOptions({ source: "schedule", durationMinutes: 300, scheduleId: "forged" }, false), { durationMinutes: 60 });
});
Deno.test("service rest retains 300 minute schedule marker and account", () => {
  const id = "00000000-0000-0000-0000-000000000001";
  const occurrenceEnd = new Date(Date.now() + 301 * 60_000).toISOString();
  assertEquals(restStartOptions({ source: "schedule", durationMinutes: 300, scheduleId: id, accountIds: [id], occurrenceEnd }, true), { durationMinutes: 300, source: "schedule", scheduleId: id, exchangeAccountId: id, occurrenceEnd });
});