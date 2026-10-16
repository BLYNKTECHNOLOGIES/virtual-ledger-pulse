// TD-FIX-B-R2 — first load, user change and failed re-runs as the page shows them (C1, C2),
// merged rows (C4), Retry scope, and a shift window that starts on the split (C7).
// Real QueryObservers with the dashboard's read options; the page's settle step is replayed
// exactly as useReadPeriodState does it (settledKey = userKey once the state is settled).
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryObserver, onlineManager } from "@tanstack/react-query";
import { planDashboardPeriod, sealedCutoffAt, type ReadRange } from "./periodPlan";
import {
  combineDashboardParts, combinePartFlags, dashboardReadOptionsBase, mergePartRows, partFailed, partReading, readPeriodState, retryFailedParts,
} from "./dashParts";
import type { TimeFilter } from "./TimePeriodFilter";

const IST = 330 * 60000, DAY = 86400000;
const ist = (y: number, mo: number, d: number, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) - IST;
const tick = () => new Promise((r) => setTimeout(r, 0));
function deferred<T>() { let resolve!: (v: T) => void; const p = new Promise<T>((a) => { resolve = a; }); return { p, resolve }; }

type Row = { orderNumber: string; createTime: number };
const ROWS: Row[] = [];
for (let t = ist(2026, 10, 1); t <= ist(2026, 10, 15, 16, 30); t += 10 * 60000) ROWS.push({ orderNumber: String(t), createTime: t });
const rowsIn = (r: ReadRange) => ROWS.filter((o) => o.createTime >= r.startTimestamp && (r.endTimestamp === null || o.createTime <= r.endTimestamp));

/** One part: real observer, dashboard options, a gate per fetch ("ok" or "fail"). */
function makePart(qc: QueryClient, interval: number) {
  const gates: ReturnType<typeof deferred<string>>[] = [];
  const opts = (range: ReadRange | null) => ({
    ...dashboardReadOptionsBase("acc", 1, range, true, interval),
    refetchInterval: false as const, retry: false,
    queryFn: async () => { const g = deferred<string>(); gates.push(g); if ((await g.p) === "fail") throw new Error("read failed"); return rowsIn(range!); },
  });
  return {
    obs: null as unknown as QueryObserver<any>,
    gates,
    init(range: ReadRange | null) { this.obs = new QueryObserver<any>(qc, opts(range) as any); return this.obs.subscribe(() => {}); },
    set(range: ReadRange | null) { this.obs.setOptions(opts(range) as any); },
    async land(mode: "ok" | "fail" = "ok") { gates.shift()!.resolve(mode); await tick(); await tick(); },
    r() { return this.obs.getCurrentResult() as any; },
  };
}

/** Replays the page: flags → readPeriodState, then settles like useReadPeriodState's effect. */
function page(userKey: () => string) {
  let settledKey: string | null = null;
  return (recent: any, older: any | null) => {
    const flags = combinePartFlags(recent, older);
    const s = readPeriodState(flags, settledKey, userKey());
    if (s.settled) settledKey = userKey();
    return { ...s, flags, rows: mergePartRows(recent.data, older ? older.data : undefined).length };
  };
}

const T0 = ist(2026, 10, 15, 16, 40);
const SEVEN: TimeFilter = { mode: "7d", shift: "all" };

describe("C1 · first load of a two-part period shimmers until every part has landed", () => {
  for (const [name, f] of [["7D", SEVEN], ["30D", { mode: "30d", shift: "all" }], ["10 Oct – today", { mode: "range", from: new Date(2026, 9, 10), to: new Date(2026, 9, 15), shift: "all" }]] as [string, TimeFilter][]) {
    it(name, async () => {
      const qc = new QueryClient();
      const plan = planDashboardPeriod(f, T0, sealedCutoffAt(T0), T0);
      expect(plan.older).not.toBeNull();
      const rec = makePart(qc, 60000), old = makePart(qc, 1800000);
      const u1 = rec.init(plan.recent), u2 = old.init(plan.older); await tick();
      const show = page(() => "f|acc");
      const s0 = show(rec.r(), old.r());
      expect(s0.loading).toBe(true); expect(s0.placeholder).toBe(false);
      await rec.land();                                   // recent part landed, older still reading
      const s1 = show(rec.r(), old.r());
      expect(s1.rows).toBeGreaterThan(0);
      expect(s1.loading).toBe(true);                      // shimmer, not partial figures as final
      expect(s1.placeholder).toBe(false);
      await old.land();
      const s2 = show(rec.r(), old.r());
      expect(s2.loading).toBe(false); expect(s2.placeholder).toBe(false); expect(s2.settled).toBe(true);
      console.log(`R2-C1 | ${name} | first load: shimmer → (recent landed, ${s1.rows} rows) shimmer → ${s2.rows} rows final`);
      u1(); u2(); qc.clear();
    });
  }
});

describe("R4 kept · Today → 7D shows the previous rows dimmed with 'Updating…'", () => {
  it("rows on Today", async () => {
    const qc = new QueryClient();
    let key = "today|acc";
    const today: TimeFilter = { mode: "1d", date: new Date(2026, 9, 15), shift: "all" };
    const pT = planDashboardPeriod(today, T0, sealedCutoffAt(T0), T0);
    const rec = makePart(qc, 60000), old = makePart(qc, 1800000);
    const u1 = rec.init(pT.recent), u2 = old.init(pT.older); await tick();
    const show = page(() => key);
    await rec.land();
    expect(show(rec.r(), null).settled).toBe(true);
    key = "7d|acc";
    const p7 = planDashboardPeriod(SEVEN, T0, sealedCutoffAt(T0), T0);
    rec.set(p7.recent); old.set(p7.older); await tick();
    const during = show(rec.r(), old.r());
    expect(during.placeholder).toBe(true); expect(during.loading).toBe(false); expect(during.rows).toBeGreaterThan(0);
    await rec.land();
    const half = show(rec.r(), old.r());                  // recent landed, older still reading: still "Updating…"
    expect(half.placeholder).toBe(true); expect(half.loading).toBe(false);
    await old.land();
    const after = show(rec.r(), old.r());
    expect(after.placeholder).toBe(false); expect(after.loading).toBe(false); expect(after.settled).toBe(true);
    u1(); u2(); qc.clear();
  });
});

describe("C1/C2 · a part that failed with no rows, run again", () => {
  it("stays failed and busy while it runs; the page shimmers (as before R1) instead of showing partial figures", async () => {
    const qc = new QueryClient();
    const plan = planDashboardPeriod(SEVEN, T0, sealedCutoffAt(T0), T0);
    const rec = makePart(qc, 60000), old = makePart(qc, 1800000);
    const u1 = rec.init(plan.recent), u2 = old.init(plan.older); await tick();
    const show = page(() => "7d|acc");
    await rec.land(); await old.land("fail");
    const failed = show(rec.r(), old.r());
    expect(failed.flags.isError).toBe(true); expect(failed.flags.failed).toEqual({ recent: false, older: true });
    expect(failed.loading).toBe(false); expect(failed.settled).toBe(true); expect(failed.flags.retryBusy).toBe(false);
    expect(failed.flags.dataUpdatedAt).toBe(0);            // → "couldn't be loaded … may be incomplete"
    // Retry: only the failed part runs again.
    const recRefetch = vi.spyOn(rec.obs, "refetch"), oldRefetch = vi.spyOn(old.obs, "refetch");
    retryFailedParts({ ...rec.r(), refetch: () => rec.obs.refetch() }, { ...old.r(), refetch: () => old.obs.refetch() });
    expect(recRefetch).not.toHaveBeenCalled(); expect(oldRefetch).toHaveBeenCalledTimes(1);
    await tick();
    const running = show(rec.r(), old.r());
    expect(old.r().isError).toBe(false);                   // TanStack clears the error while it re-runs…
    expect(partFailed(old.r())).toBe(true);                // …so the part still counts as failed
    expect(running.flags.isError).toBe(true); expect(running.flags.retryBusy).toBe(true);
    expect(running.loading).toBe(true); expect(running.placeholder).toBe(false);
    await old.land("fail");
    const again = show(rec.r(), old.r());
    expect(again.flags.isError).toBe(true); expect(again.flags.retryBusy).toBe(false); expect(again.loading).toBe(false);
    old.obs.refetch(); await tick(); await old.land("ok");
    const fixed = show(rec.r(), old.r());
    expect(fixed.flags.isError).toBe(false); expect(fixed.loading).toBe(false); expect(fixed.flags.retryBusy).toBe(false);
    u1(); u2(); qc.clear();
  });

  it("a refresh that failed keeps its rows; while it runs again it is busy but the figures stay", async () => {
    const qc = new QueryClient();
    const plan = planDashboardPeriod(SEVEN, T0, sealedCutoffAt(T0), T0);
    const rec = makePart(qc, 60000), old = makePart(qc, 1800000);
    const u1 = rec.init(plan.recent), u2 = old.init(plan.older); await tick();
    const show = page(() => "7d|acc");
    await rec.land(); await old.land();
    old.obs.refetch(); await tick(); await old.land("fail");
    const kept = show(rec.r(), old.r());
    expect(kept.flags.isError).toBe(true); expect(kept.loading).toBe(false); expect(kept.rows).toBeGreaterThan(0);
    old.obs.refetch(); await tick();
    const busy = show(rec.r(), old.r());
    expect(busy.flags.retryBusy).toBe(true); expect(busy.flags.isError).toBe(true); expect(busy.loading).toBe(false);
    await old.land("ok");
    expect(show(rec.r(), old.r()).flags.isError).toBe(false);
    u1(); u2(); qc.clear();
  });

  it("the recent part's scheduled re-read is not 'busy' when only the older part failed", () => {
    const part = (o: object) => ({ data: [], isLoading: false, isPlaceholderData: false, isError: false, isFetching: false, dataUpdatedAt: 5, errorUpdatedAt: 0, ...o });
    const f = combinePartFlags(part({ isFetching: true }), part({ isError: true, data: undefined, dataUpdatedAt: 0, errorUpdatedAt: 9 }));
    expect(f.retryBusy).toBe(false); expect(f.isError).toBe(true);
  });
});

describe("C4 · merged rows", () => {
  it("merged by order number, recent copy first; a row repeated within one part counted once", () => {
    const a = [{ orderNumber: "1", v: "recent" }, { orderNumber: "2", v: "recent" }];
    const b = [{ orderNumber: "2", v: "older" }, { orderNumber: "3", v: "older" }];
    expect(mergePartRows(a, undefined)).toEqual(a);
    expect(mergePartRows(undefined, b)).toEqual(b);
    expect(mergePartRows(a, [])).toEqual(a);
    expect(mergePartRows(a, b)).toEqual([a[0], a[1], b[1]]);
    expect(mergePartRows([a[0], a[1], a[0]], undefined)).toEqual(a);       // offset paging repeated a row
    expect(combineDashboardParts({ data: a, isLoading: false, isPlaceholderData: false, isError: false, isFetching: false, dataUpdatedAt: 1 }, null).data).toEqual(a);
  });
});

describe("F1 · a read paused while the device is offline still counts as in progress", () => {
  const base = { isLoading: false, isPlaceholderData: false, isError: false, isFetching: false, dataUpdatedAt: 0, errorUpdatedAt: 0 };
  it("a first read paused offline: partial → shimmer, never partial figures as final", () => {
    const recent = { ...base, data: [{ orderNumber: "1" }], status: "success" as const, fetchStatus: "idle" as const, dataUpdatedAt: 5 };
    const older = { ...base, data: undefined, status: "pending" as const, fetchStatus: "paused" as const };
    const f = combinePartFlags(recent, older);
    expect(partReading(older)).toBe(true); expect(f.partial).toBe(true);
    expect(readPeriodState(f, "7d|acc", "7d|acc").loading).toBe(true);
    expect(readPeriodState(f, null, "7d|acc").loading).toBe(true);
  });
  it("a failed part whose re-run is paused offline stays failed and busy", () => {
    const recent = { ...base, data: [], status: "success" as const, fetchStatus: "idle" as const, dataUpdatedAt: 5 };
    const older = { ...base, data: undefined, status: "pending" as const, fetchStatus: "paused" as const, errorUpdatedAt: 9 };
    const f = combinePartFlags(recent, older);
    expect(partFailed(older)).toBe(true); expect(f.isError).toBe(true); expect(f.retryBusy).toBe(true);
  });
  it("real observer: offline → paused (pending, not loading) counts as reading; back online it lands", async () => {
    const qc = new QueryClient();
    qc.mount(); // as QueryClientProvider does: resumes paused reads when the device is back online
    onlineManager.setOnline(false);
    try {
      const obs = new QueryObserver<any>(qc, { queryKey: ["offline-part"], queryFn: async () => [{ orderNumber: "x" }], retry: false });
      const u = obs.subscribe(() => {}); await tick();
      const r = obs.getCurrentResult() as any;
      expect(r.fetchStatus).toBe("paused"); expect(r.isLoading).toBe(false); expect(r.isFetching).toBe(false);
      expect(partReading(r)).toBe(true);
      onlineManager.setOnline(true);
      await vi.waitFor(() => expect(partReading(obs.getCurrentResult() as any)).toBe(false));
      expect((obs.getCurrentResult() as any).data).toEqual([{ orderNumber: "x" }]);
      u(); qc.clear();
    } finally {
      onlineManager.setOnline(true);
      qc.unmount();
    }
  });
});

describe("C7 · a shift window that starts exactly on the split stays in the summary windows", () => {
  it("1Y + Evening with the split at 31 Aug 17:30 IST", () => {
    const now = ist(2026, 10, 15, 17, 45);
    const held = sealedCutoffAt(now);
    expect(held).toBe(ist(2026, 8, 31, 17, 30));
    const p = planDashboardPeriod({ mode: "1y", shift: "shift3" }, now, held, now);
    expect(p.summary.windows.some(([ws, we]) => ws === held && we === held)).toBe(true);
    for (const [ws, we] of p.summary.windows) { expect(ws).toBeLessThanOrEqual(held); expect(we).toBeLessThanOrEqual(held); }
    expect(p.summary.windows.length).toBeGreaterThan(0);
    expect(DAY).toBe(86400000);
  });
});
