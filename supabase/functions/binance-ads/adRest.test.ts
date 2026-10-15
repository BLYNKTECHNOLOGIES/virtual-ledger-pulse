// AM-FIX-2 / AM-FIX-3 — rest start/end logic with mocked Binance calls and an in-memory store.
import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { endAdRest, startAdRest, restAccountsFromPayload, MSG_ALREADY_RUNNING, MSG_LAST_STILL_ENDING, MSG_PRIVATE_SWITCHED_OFF, MSG_STILL_STARTING, MSG_UNCLEAR_OFF, type RestDeps, type RestTimerRow } from "../_shared/adRest.ts";

const A1 = "acct-1", A2 = "acct-2";

type Opts = {
  refuseOff?: Set<string>;
  refusePrivate?: Set<string>;
  /** Live Binance state per ad: 1 Online, 2 Private, 3 Offline, null unreadable. */
  live?: Record<string, number | null>;
  accountOf?: Record<string, string>;
  handChanged?: Set<string>;
  handCheckFails?: number;
  snapshotAccounts?: Record<string, string>;
  /** The call goes through on Binance but the reply is lost (e.g. 504). */
  lostReply?: Set<string>;
  /** Hook run before each switch-off call (lets a test press Resume mid-start). */
  beforeOff?: (advNo: string) => Promise<void>;
  /** AM-FIX-4: Private refused AND the revert to Offline failed → ad left Online + public. */
  revertFails?: Set<string>;
  /** Switch-off times out (no answer); Binance applies it a moment later. */
  lateOff?: Set<string>;
  /** The restore call for these ads never returns (function killed mid-end) — once. */
  hangRestore?: Set<string>;
};

const DEFAULT_LIVE = { "111": 1, "222": 2, "333": 1 };
const DEFAULT_ACCT = { "111": A1, "222": A1, "333": A2 };

function harness(opts: Opts = {}) {
  const calls: { accountId: string | null; advNo: string; status: number; fromStatus?: number }[] = [];
  const timers: RestTimerRow[] = [];
  const logs: any[] = [];
  const live: Record<string, number | null> = { ...(opts.live ?? DEFAULT_LIVE) };
  const accountOf: Record<string, string> = { ...(opts.accountOf ?? DEFAULT_ACCT) };
  let handFails = opts.handCheckFails ?? 0;
  let clock = new Date("2026-10-15T09:00:00Z");
  const deps: RestDeps = {
    primaryAccountId: A1,
    now: () => clock,
    store: {
      async getActiveTimer() { return timers.filter((t) => t.is_active).at(-1) ?? null; },
      async insertTimer(row) {
        if (timers.some((t) => t.is_active)) throw new Error('Could not start the rest: duplicate key value violates unique constraint "ad_rest_timer_active_idx"');
        const t = { id: `t${timers.length + 1}`, started_at: clock.toISOString(), is_active: true, start_completed_at: null, ...row } as RestTimerRow;
        timers.push(t); return t;
      },
      // Same semantics as UPDATE … WHERE id=? AND is_active RETURNING.
      async completeStart(id, snaps, keep) {
        const t = timers.find((x) => x.id === id)!;
        t.start_completed_at = clock.toISOString();
        if (!t.is_active) return false;
        t.deactivated_ad_nos = snaps.map((s) => s.advNo); t.deactivated_ad_statuses = snaps;
        if (!keep) { t.is_active = false; t.ended_at = clock.toISOString(); }
        return true;
      },
      async claimTimer(id, staleBefore) {
        const t = timers.find((x) => x.id === id && x.is_active && (x.start_completed_at || x.started_at < staleBefore));
        if (!t) return null;
        t.is_active = false; t.ended_at = clock.toISOString(); t.end_lease_at = clock.toISOString(); return { ...t };
      },
      async getTimer(id) { const t = timers.find((x) => x.id === id); return t ? { ...t } : null; },
      async claimUnfinishedEnd(id, leaseStale) {
        const t = timers.find((x) => x.id === id && !x.is_active && !x.end_completed_at && (!x.end_lease_at || x.end_lease_at < leaseStale));
        if (!t) return null;
        t.end_lease_at = clock.toISOString(); return { ...t };
      },
      async finishEnd(id) {
        const t = timers.find((x) => x.id === id)!;
        if (t.end_completed_at) return false;
        t.end_completed_at = clock.toISOString(); return true;
      },
      async handChangedAdvNos(advNos) {
        if (handFails > 0) { handFails--; throw new Error("ad_action_logs timeout"); }
        return new Set(advNos.filter((a) => opts.handChanged?.has(a)));
      },
      async latestSnapshotAccount(advNo) { return opts.snapshotAccounts?.[advNo] ?? null; },
      async insertLog(e) { logs.push(e); },
    },
    binance: {
      async setStatus(accountId, advNo, status, fromStatus) {
        if (status === 3 && opts.beforeOff) await opts.beforeOff(advNo);
        calls.push({ accountId, advNo, status, fromStatus });
        if (status !== 3 && opts.hangRestore?.has(advNo)) { opts.hangRestore.delete(advNo); return new Promise(() => {}); }
        await new Promise((r) => setTimeout(r, 1));
        if (status === 3 && opts.lateOff?.has(advNo)) {
          setTimeout(() => { live[advNo] = 3; }, 5);
          return { ok: false, unclear: true, reason: "no reply from Binance (timed out)" };
        }
        if (status === 2 && opts.revertFails?.has(advNo)) {
          live[advNo] = 1; // brought online, Private refused, revert to Offline failed
          return { ok: false, reason: "Private refused, and switching it back failed — the ad is now ONLINE AND PUBLIC" };
        }
        if (status === 3 && opts.refuseOff?.has(advNo)) return { ok: false, reason: "Binance 187049 ad locked" };
        if (status === 2 && opts.refusePrivate?.has(advNo)) return { ok: false, reason: "Private not accepted by Binance" };
        live[advNo] = status;
        if (opts.lostReply?.has(advNo)) return { ok: false, reason: "HTTP 504" };
        return { ok: true };
      },
      async getStatus(_a, advNo) { return advNo in live ? live[advNo] : 3; },
      async listLive(accountId) {
        return Object.keys(live).filter((a) => accountOf[a] === accountId).map((advNo) => ({ advNo, status: live[advNo] }));
      },
    },
  };
  return { deps, calls, timers, logs, live, advance: (min: number) => { clock = new Date(clock.getTime() + min * 60_000); } };
}

const BOTH = [A1, A2];

Deno.test("(a) start with ads on two accounts: per-account calls, snapshot keeps account + status", async () => {
  const h = harness();
  const r = await startAdRest(h.deps, { accountIds: BOTH, userId: "u1", userName: "Op" });
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
  const r = await startAdRest(h.deps, { accountIds: BOTH, userId: "u1", userName: "Op" });
  assertEquals(r.started, true);
  assertEquals(h.timers[0].is_active, true);
  assertEquals(h.timers[0].deactivated_ad_nos, ["111", "333"]);
  assertEquals(r.failed.map((f) => [f.advNo, f.reason]), [["222", "Binance 187049 ad locked"]]);
});

Deno.test("(c) automatic end after the hour: restores per account and logs AD_REST_ENDED", async () => {
  const h = harness();
  await startAdRest(h.deps, { accountIds: BOTH, userId: "u1", userName: "Op" });
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
  await startAdRest(h.deps, { accountIds: BOTH, userId: "u1", userName: "Op" });
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
  await startAdRest(h.deps, { accountIds: BOTH, userId: "u1", userName: "Op" });
  h.calls.length = 0;
  const r: any = await endAdRest(h.deps, { mode: "manual", userId: "u1", userName: "Op" });
  const priv = h.calls.find((c) => c.advNo === "222")!;
  assertEquals([priv.status, priv.fromStatus], [2, 3]);
  assert(!h.calls.some((c) => c.advNo === "222" && c.status === 1), "never made public");
  assertEquals(r.failed, [{ advNo: "222", accountId: A1, wasPrivate: true, reason: "Private not accepted by Binance" }]);
});

Deno.test("(f) ad changed by hand during the rest is left alone", async () => {
  const h = harness({ handChanged: new Set(["111"]) });
  await startAdRest(h.deps, { accountIds: BOTH, userId: "u1", userName: "Op" });
  h.live["333"] = 1; // switched back on in the Binance app
  h.calls.length = 0;
  const r: any = await endAdRest(h.deps, { mode: "manual", userId: "u1", userName: "Op" });
  assertEquals(h.calls.map((c) => c.advNo), ["222"]);
  assertEquals(r.skipped.map((s: any) => s.advNo).sort(), ["111", "333"]);
});

Deno.test("old timer without account: latest snapshot account, else primary", async () => {
  const h = harness({ snapshotAccounts: { "333": A2 }, live: { "111": 3, "333": 3 } });
  h.timers.push({ id: "old", started_at: "2026-10-15T07:00:00Z", duration_minutes: 60, started_by: "x", is_active: true,
    start_completed_at: "2026-10-15T07:00:00Z",
    deactivated_ad_nos: ["111", "333"], deactivated_ad_statuses: [{ advNo: "111", advStatus: 1 } as any, { advNo: "333", advStatus: 1 } as any] });
  const r: any = await endAdRest(h.deps, { mode: "automatic", userId: null, userName: "automatic" });
  assertEquals(h.calls.map((c) => [c.advNo, c.accountId]).sort(), [["111", A1], ["333", A2]]);
  assertEquals(r.account_fallbacks, [{ advNo: "111", source: "primary_account" }, { advNo: "333", source: "latest_ad_state_snapshot" }]);
});

// ---- AM-FIX-3 ----

Deno.test("(1) Resume during start is refused; nothing is left off under an ended timer", async () => {
  let resume: any = null;
  const h = harness({
    live: { "a": 1, "b": 1, "c": 1, "d": 1 }, accountOf: { a: A1, b: A1, c: A1, d: A1 },
    beforeOff: async (advNo) => {
      if (advNo === "c" && !resume) resume = await endAdRest(h.deps, { mode: "manual", userId: "u2", userName: "Op2" });
    },
  });
  const r: any = await startAdRest(h.deps, { accountIds: [A1], userId: "u1", userName: "Op" });
  assertEquals(resume.claimed, false);
  assertEquals(resume.reason, MSG_STILL_STARTING);
  assertEquals(r.started, true);
  assertEquals(h.timers[0].deactivated_ad_nos, ["a", "b", "c", "d"]);
  // Resume after the start finished works and restores all four.
  const end: any = await endAdRest(h.deps, { mode: "manual", userId: "u2", userName: "Op2" });
  assertEquals(end.restored.length, 4);
  assertEquals(Object.values(h.live), [1, 1, 1, 1]);
});

Deno.test("(1b) a timer that ended during start: those ads are switched back on and reported", async () => {
  const h = harness({
    live: { "a": 1, "b": 1 }, accountOf: { a: A1, b: A1 },
    beforeOff: async (advNo) => { if (advNo === "b") h.timers[0].is_active = false; }, // ended out-of-band
  });
  const r: any = await startAdRest(h.deps, { accountIds: [A1], userId: "u1", userName: "Op" });
  assertEquals(r.started, false);
  assertEquals(r.endedDuringStart, true);
  assertEquals(r.restoredAfterEnd.map((x: any) => x.advNo), ["a", "b"]);
  assertEquals(h.live, { a: 1, b: 1 });
});

Deno.test("(2) live state at start: ad already off is not recorded or restored; Private from the live flag; unreadable reported", async () => {
  // Browser would have said 'x' Online, 'p' Online — Binance says x is off, p is Private, u unreadable, n newly on.
  const h = harness({ live: { x: 3, p: 2, u: null, n: 1 }, accountOf: { x: A1, p: A1, u: A1, n: A1 } });
  const r: any = await startAdRest(h.deps, { accountIds: [A1], userId: "u1", userName: "Op" });
  assertEquals(h.timers[0].deactivated_ad_statuses, [
    { advNo: "p", advStatus: 2, accountId: A1 }, { advNo: "n", advStatus: 1, accountId: A1 },
  ]);
  assert(!h.calls.some((c) => c.advNo === "x" || c.advNo === "u"), "already-off / unreadable ads untouched");
  assertEquals(r.unreadable.map((x: any) => x.advNo), ["u"]);
  h.calls.length = 0;
  await endAdRest(h.deps, { mode: "manual", userId: "u1", userName: "Op" });
  assertEquals(h.calls.map((c) => [c.advNo, c.status, c.fromStatus]), [["p", 2, 3], ["n", 1, undefined]]);
  assertEquals(h.live.x, 3);
});

Deno.test("(3) lost reply on switch-off and on restore: decided from the live status", async () => {
  const h = harness({ lostReply: new Set(["111", "333"]) });
  const r: any = await startAdRest(h.deps, { accountIds: BOTH, userId: "u1", userName: "Op" });
  assertEquals(r.failed, []);
  assertEquals(h.timers[0].deactivated_ad_nos, ["111", "222", "333"]);
  const e: any = await endAdRest(h.deps, { mode: "manual", userId: "u1", userName: "Op" });
  assertEquals(e.restored.map((x: any) => x.advNo).sort(), ["111", "222", "333"]);
  assertEquals(e.failed, []);
});

Deno.test("(4) starting while an expired rest is still active gives the clear message", async () => {
  const h = harness();
  await startAdRest(h.deps, { accountIds: BOTH, userId: "u1", userName: "Op" });
  h.advance(65);
  await assertRejects(() => startAdRest(h.deps, { accountIds: BOTH, userId: "u2", userName: "Op2" }), Error, MSG_LAST_STILL_ENDING);
});

Deno.test("(5) Edit-dialog status change during the rest is left alone; failed check never restores blindly", async () => {
  // The store counts ad.updated rows with metadata.statusChanged (see supabaseRestStore); here it reports 111.
  const h = harness({ handChanged: new Set(["111"]) });
  await startAdRest(h.deps, { accountIds: BOTH, userId: "u1", userName: "Op" });
  h.calls.length = 0;
  const r: any = await endAdRest(h.deps, { mode: "manual", userId: "u1", userName: "Op" });
  assert(!h.calls.some((c) => c.advNo === "111"));
  assertEquals(r.skipped.map((s: any) => s.advNo), ["111"]);

  const h2 = harness({ handCheckFails: 2 });
  await startAdRest(h2.deps, { accountIds: BOTH, userId: "u1", userName: "Op" });
  h2.calls.length = 0;
  const r2: any = await endAdRest(h2.deps, { mode: "manual", userId: "u1", userName: "Op" });
  assertEquals(h2.calls.length, 0);
  assertEquals(r2.claimed, false);
  assert(r2.reason.includes("Could not check whether ads were changed by hand"));

  const h3 = harness({ handCheckFails: 1 }); // one retry succeeds
  await startAdRest(h3.deps, { accountIds: BOTH, userId: "u1", userName: "Op" });
  const r3: any = await endAdRest(h3.deps, { mode: "manual", userId: "u1", userName: "Op" });
  assertEquals(r3.restored.length, 3);
});

// ---- AM-FIX-4 ----

Deno.test("(F4-1) Private refused + revert failed: ad switched back off and reported", async () => {
  const h = harness({ revertFails: new Set(["222"]) });
  await startAdRest(h.deps, { accountIds: BOTH, userId: "u1", userName: "Op" });
  const r: any = await endAdRest(h.deps, { mode: "manual", userId: "u1", userName: "Op" });
  assertEquals(h.live["222"], 3, "never left public");
  assertEquals(r.failed, [{ advNo: "222", accountId: A1, wasPrivate: true, reason: MSG_PRIVATE_SWITCHED_OFF }]);
  assertEquals(r.restored.map((x: any) => x.advNo), ["111", "333"]);
});

Deno.test("(F4-2) switch-off times out then lands: ad stays in the row and is restored at the end", async () => {
  const h = harness({ lateOff: new Set(["333"]) });
  const s: any = await startAdRest(h.deps, { accountIds: BOTH, userId: "u1", userName: "Op" });
  assertEquals(h.timers[0].deactivated_ad_nos, ["111", "222", "333"]);
  assertEquals(s.unclear, [{ advNo: "333", accountId: A2, wasPrivate: false, reason: MSG_UNCLEAR_OFF }]);
  assertEquals(s.failed, []);
  await new Promise((r) => setTimeout(r, 20)); // Binance applies it late
  assertEquals(h.live["333"], 3);
  const e: any = await endAdRest(h.deps, { mode: "manual", userId: "u1", userName: "Op" });
  assertEquals(e.restored.map((x: any) => x.advNo), ["111", "222", "333"]);
  assertEquals(h.live["333"], 1);
});

Deno.test("(F4-3) hand-check failing: timer stays active, a later end restores", async () => {
  const h = harness({ handCheckFails: 2 });
  await startAdRest(h.deps, { accountIds: BOTH, userId: "u1", userName: "Op" });
  h.advance(61);
  h.calls.length = 0;
  const r1: any = await endAdRest(h.deps, { mode: "automatic", userId: null, userName: "automatic" });
  assertEquals(r1.claimed, false);
  assertEquals(r1.retryLater, true);
  assertEquals(h.timers[0].is_active, true);
  assertEquals(h.calls.length, 0);
  h.advance(1);
  const r2: any = await endAdRest(h.deps, { mode: "automatic", userId: null, userName: "automatic" });
  assertEquals(r2.claimed, true);
  assertEquals(r2.restored.length, 3);
  assertEquals(h.logs.filter((l) => l.action_type === "ad.rest_ended").length, 1);
});

Deno.test("(F4-4) end interrupted part-way: next run finishes it once, even when two runs overlap", async () => {
  const h = harness({ hangRestore: new Set(["333"]) });
  await startAdRest(h.deps, { accountIds: BOTH, userId: "u1", userName: "Op" });
  h.advance(61);
  // First end: claims, restores A1's ads, then the call for 333 never returns (function killed).
  endAdRest(h.deps, { mode: "automatic", userId: null, userName: "automatic" });
  await new Promise((r) => setTimeout(r, 30));
  assertEquals(h.timers[0].is_active, false);
  assertEquals(h.timers[0].end_completed_at ?? null, null);
  assertEquals([h.live["111"], h.live["222"], h.live["333"]], [1, 2, 3]);
  assertEquals(h.logs.filter((l) => l.action_type === "ad.rest_ended").length, 0);
  // Within the lease nothing re-runs it.
  const early: any = await endAdRest(h.deps, { timerId: "t1", mode: "automatic", userId: null, userName: "automatic" });
  assertEquals(early.claimed, false);
  h.advance(4);
  h.calls.length = 0;
  const [x, y]: any[] = await Promise.all([
    endAdRest(h.deps, { timerId: "t1", mode: "automatic", userId: null, userName: "automatic" }),
    endAdRest(h.deps, { timerId: "t1", mode: "automatic", userId: null, userName: "automatic" }),
  ]);
  assertEquals([x.claimed, y.claimed].filter(Boolean).length, 1);
  const done = x.claimed ? x : y;
  assertEquals(done.recovered, true);
  assertEquals(done.restored.map((a: any) => a.advNo), ["333"]);
  assertEquals(done.skipped.map((a: any) => a.advNo), ["111", "222"]);
  assertEquals(h.calls.filter((c) => c.status !== 3).map((c) => c.advNo), ["333"]);
  assertEquals(h.live["333"], 1);
  assertEquals(h.logs.filter((l) => l.action_type === "ad.rest_ended").length, 1);
  // A third run afterwards does nothing.
  const z: any = await endAdRest(h.deps, { timerId: "t1", mode: "automatic", userId: null, userName: "automatic" });
  assertEquals(z.claimed, false);
});

Deno.test("(F4-5) old { ads } payload from the second account rests that account", async () => {
  const accts = restAccountsFromPayload({ ads: [{ advNo: "333", advStatus: 1, accountId: A2 }] });
  assertEquals(accts, [A2]);
  assertEquals(restAccountsFromPayload({ accountIds: [A1, A2], ads: [{ accountId: A2 }] }), [A1, A2]);
  assertEquals(restAccountsFromPayload({}), []); // → primary inside startAdRest
  const h = harness();
  await startAdRest(h.deps, { accountIds: accts, userId: "u1", userName: "Op" });
  assertEquals(h.calls.map((c) => [c.accountId, c.advNo]), [[A2, "333"]]);
  assertEquals([h.live["111"], h.live["222"]], [1, 2]);
});

Deno.test("(F4-6a) two starts at once: the second is told a rest is already running", async () => {
  const h = harness();
  const [a, b] = await Promise.allSettled([
    startAdRest(h.deps, { accountIds: BOTH, userId: "u1", userName: "Op" }),
    startAdRest(h.deps, { accountIds: BOTH, userId: "u2", userName: "Op2" }),
  ]);
  const rejected = [a, b].filter((x) => x.status === "rejected") as PromiseRejectedResult[];
  assertEquals(rejected.length, 1);
  assertEquals(rejected[0].reason.message, MSG_ALREADY_RUNNING);
  assertEquals(h.timers.length, 1);
});
