// AM-FIX-2 — rest start/end logic with mocked Binance calls and an in-memory store.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { endAdRest, startAdRest, type RestDeps, type RestTimerRow } from "../_shared/adRest.ts";

const A1 = "acct-1", A2 = "acct-2";

function harness(opts: {
  refuseOff?: Set<string>;
  refusePrivate?: Set<string>;
  current?: Record<string, number>;
  handChanged?: Set<string>;
  snapshotAccounts?: Record<string, string>;
} = {}) {
  const calls: { accountId: string | null; advNo: string; status: number; fromStatus?: number }[] = [];
  const timers: RestTimerRow[] = [];
  const logs: any[] = [];
  let clock = new Date("2026-10-15T09:00:00Z");
  const deps: RestDeps = {
    primaryAccountId: A1,
    now: () => clock,
    store: {
      async getActiveTimer() { return timers.filter((t) => t.is_active).at(-1) ?? null; },
      async insertTimer(row) {
        const t = { id: `t${timers.length + 1}`, started_at: clock.toISOString(), is_active: true, ...row } as RestTimerRow;
        timers.push(t); return t;
      },
      async updateTimerAds(id, snaps, keep) {
        const t = timers.find((x) => x.id === id)!;
        t.deactivated_ad_nos = snaps.map((s) => s.advNo); t.deactivated_ad_statuses = snaps;
        if (!keep) t.is_active = false;
      },
      // Same semantics as UPDATE … WHERE id=? AND is_active RETURNING *.
      async claimTimer(id) {
        const t = timers.find((x) => x.id === id && x.is_active);
        if (!t) return null;
        t.is_active = false; return { ...t };
      },
      async handChangedAdvNos(advNos) { return new Set(advNos.filter((a) => opts.handChanged?.has(a))); },
      async latestSnapshotAccount(advNo) { return opts.snapshotAccounts?.[advNo] ?? null; },
      async insertLog(e) { logs.push(e); },
    },
    binance: {
      async setStatus(accountId, advNo, status, fromStatus) {
        calls.push({ accountId, advNo, status, fromStatus });
        await new Promise((r) => setTimeout(r, 1));
        if (status === 3 && opts.refuseOff?.has(advNo)) return { ok: false, reason: "Binance 187049 ad locked" };
        if (status === 2 && opts.refusePrivate?.has(advNo)) return { ok: false, reason: "Private not accepted by Binance" };
        return { ok: true };
      },
      async getStatus(_a, advNo) { return opts.current?.[advNo] ?? 3; },
    },
  };
  return { deps, calls, timers, logs, advance: (min: number) => { clock = new Date(clock.getTime() + min * 60_000); } };
}

const ADS = [
  { advNo: "111", advStatus: 1, accountId: A1 },
  { advNo: "222", advStatus: 2, accountId: A1 },
  { advNo: "333", advStatus: 1, accountId: A2 },
];

Deno.test("(a) start with ads on two accounts: per-account calls, snapshot keeps account + status", async () => {
  const h = harness();
  const r = await startAdRest(h.deps, { ads: ADS, userId: "u1", userName: "Op" });
  assertEquals(r.started, true);
  assertEquals(h.calls.map((c) => [c.accountId, c.advNo, c.status]).sort(), [[A1, "111", 3], [A1, "222", 3], [A2, "333", 3]]);
  assertEquals(h.timers[0].deactivated_ad_statuses, [
    { advNo: "111", advStatus: 1, accountId: A1 },
    { advNo: "222", advStatus: 2, accountId: A1 },
    { advNo: "333", advStatus: 1, accountId: A2 },
  ]);
});

Deno.test("(b) one ad refused at start: rest still starts, row lists only switched-off ads", async () => {
  const h = harness({ refuseOff: new Set(["222"]) });
  const r = await startAdRest(h.deps, { ads: ADS, userId: "u1", userName: "Op" });
  assertEquals(r.started, true);
  assertEquals(h.timers[0].is_active, true);
  assertEquals(h.timers[0].deactivated_ad_nos, ["111", "333"]);
  assertEquals(r.failed.map((f) => [f.advNo, f.reason]), [["222", "Binance 187049 ad locked"]]);
});

Deno.test("(c) automatic end after the hour: restores per account and logs AD_REST_ENDED", async () => {
  const h = harness();
  await startAdRest(h.deps, { ads: ADS, userId: "u1", userName: "Op" });
  h.calls.length = 0;
  const early = await endAdRest(h.deps, { mode: "automatic", userId: null, userName: "automatic" });
  assertEquals(early.claimed, false);
  h.advance(61);
  const r: any = await endAdRest(h.deps, { mode: "automatic", userId: null, userName: "automatic" });
  assertEquals(r.claimed, true);
  assertEquals(h.calls.map((c) => [c.accountId, c.advNo, c.status, c.fromStatus]).sort(),
    [[A1, "111", 1, undefined], [A1, "222", 2, 3], [A2, "333", 1, undefined]]);
  const log = h.logs.find((l) => l.action_type === "ad.rest_ended");
  assertEquals(log.metadata.mode, "automatic");
  assertEquals(log.metadata.ended_by, "automatic");
  assertEquals(log.metadata.restored.length, 3);
});

Deno.test("(d) two end calls at the same moment: only one restore", async () => {
  const h = harness();
  await startAdRest(h.deps, { ads: ADS, userId: "u1", userName: "Op" });
  h.calls.length = 0;
  h.advance(61);
  const [x, y]: any[] = await Promise.all([
    endAdRest(h.deps, { mode: "automatic", userId: null, userName: "automatic" }),
    endAdRest(h.deps, { mode: "manual", userId: "u2", userName: "Op2" }),
  ]);
  assertEquals([x.claimed, y.claimed].filter(Boolean).length, 1);
  assertEquals(h.calls.length, 3);
  assertEquals(h.logs.filter((l) => l.action_type === "ad.rest_ended").length, 1);
});

Deno.test("(e) Private ad: Private attempted; refusal leaves it off and is reported", async () => {
  const h = harness({ refusePrivate: new Set(["222"]) });
  await startAdRest(h.deps, { ads: ADS, userId: "u1", userName: "Op" });
  h.calls.length = 0;
  const r: any = await endAdRest(h.deps, { mode: "manual", userId: "u1", userName: "Op" });
  const priv = h.calls.find((c) => c.advNo === "222")!;
  assertEquals([priv.status, priv.fromStatus], [2, 3]);
  assert(!h.calls.some((c) => c.advNo === "222" && c.status === 1), "never made public");
  assertEquals(r.failed, [{ advNo: "222", accountId: A1, wasPrivate: true, reason: "Private not accepted by Binance" }]);
});

Deno.test("(f) ad changed by hand during the rest is left alone", async () => {
  const h = harness({ handChanged: new Set(["111"]), current: { "333": 1 } });
  await startAdRest(h.deps, { ads: ADS, userId: "u1", userName: "Op" });
  h.calls.length = 0;
  const r: any = await endAdRest(h.deps, { mode: "manual", userId: "u1", userName: "Op" });
  assertEquals(h.calls.map((c) => c.advNo), ["222"]);
  assertEquals(r.skipped.map((s: any) => s.advNo).sort(), ["111", "333"]);
});

Deno.test("old timer without account: latest snapshot account, else primary", async () => {
  const h = harness({ snapshotAccounts: { "333": A2 } });
  h.timers.push({ id: "old", started_at: "2026-10-15T07:00:00Z", duration_minutes: 60, started_by: "x", is_active: true,
    deactivated_ad_nos: ["111", "333"], deactivated_ad_statuses: [{ advNo: "111", advStatus: 1 } as any, { advNo: "333", advStatus: 1 } as any] });
  const r: any = await endAdRest(h.deps, { mode: "automatic", userId: null, userName: "automatic" });
  assertEquals(h.calls.map((c) => [c.advNo, c.accountId]).sort(), [["111", A1], ["333", A2]]);
  assertEquals(r.account_fallbacks, [{ advNo: "111", source: "primary_account" }, { advNo: "333", source: "latest_ad_state_snapshot" }]);
});
