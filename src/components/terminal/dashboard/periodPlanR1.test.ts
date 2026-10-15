// TD-FIX-B-R1 — V1 (a)–(j). Run with TZ=Asia/Kolkata and TZ=UTC.
import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { QueryClient, QueryObserver } from "@tanstack/query-core";
import {
  planDashboardPeriod, makePlanPredicate, sealedCutoffAt, readKey, summaryKey, istDayStart,
  type DashboardPeriodPlan, type ReadRange,
} from "./periodPlan";
import { combineDashboardParts, createDashboardClock, dashboardReadOptionsBase, retryFailedParts } from "./dashParts";
import { buildShiftWindows, type TimeFilter } from "./TimePeriodFilter";
import { buildDaySeries } from "./daySeries";
import { aggregateSummaryRows, type OrderSummaryRow } from "@/lib/orderSummary";
import { topAdsEmptyLines } from "./adRanking";

const IST = 330 * 60000, H = 3600000, DAY = 86400000;
const ist = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0) => Date.UTC(y, mo - 1, d, h, mi, s) - IST;
const day = (y: number, mo: number, d: number) => new Date(y, mo - 1, d);
const fmt = (ts: number) => new Date(ts + IST).toISOString().slice(5, 16).replace("T", " ");
const TZ = process.env.TZ || "local";

type O = { orderNumber: string; createTime: number };
function makeOrders(from: number, to: number): O[] {
  const out: O[] = [];
  for (let t = from; t <= to; t += 10 * 60000) out.push({ orderNumber: String(t), createTime: t });
  return out;
}
const inRange = (r: ReadRange, t: number) => t >= r.startTimestamp && (r.endTimestamp === null || t <= r.endTimestamp);

function deferred<T>() { let resolve!: (v: T) => void, reject!: (e: unknown) => void; const p = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { p, resolve, reject }; }
const tick = () => new Promise((r) => setTimeout(r, 0));

// ───────────────────────── V1a · R1 midnight with real observers ─────────────────────────
const ORDERS = makeOrders(ist(2026, 9, 1), ist(2026, 10, 15, 23, 59));
type Gate = Map<string, ReturnType<typeof deferred<any>>>;
function opts(range: ReadRange | null, scheduled: boolean, interval: number, gate: Gate) {
  const base = dashboardReadOptionsBase("acc", 1, range, scheduled, interval);
  return {
    ...base, refetchInterval: false as const, retry: false,
    queryFn: async () => {
      const d = deferred<any>(); gate.set(JSON.stringify(base.queryKey), d);
      const mode = await d.p;
      if (mode === "fail") throw new Error("read failed");
      return ORDERS.filter((o) => inRange(range!, o.createTime));
    },
  };
}

async function midnight(f: TimeFilter, first: "recent" | "older" | "fail-older") {
  const qc = new QueryClient();
  const gate: Gate = new Map();
  const before = ist(2026, 10, 15, 23, 59), after = ist(2026, 10, 16, 0, 0);
  const held = sealedCutoffAt(before), chosen = before;
  const p0 = planDashboardPeriod(f, before, held, chosen), p1 = planDashboardPeriod(f, after, held, chosen);
  const r = new QueryObserver<any>(qc, opts(p0.recent, true, 60000, gate) as any);
  const o = new QueryObserver<any>(qc, opts(p0.older, true, 1800000, gate) as any);
  const u1 = r.subscribe(() => {}), u2 = o.subscribe(() => {});
  await tick(); for (const d of gate.values()) d.resolve(1); await tick(); await tick();
  const shown = (p: DashboardPeriodPlan) => {
    const c = combineDashboardParts(r.getCurrentResult() as any, p.older ? (o.getCurrentResult() as any) : null);
    const pred = makePlanPredicate(p);
    const ids = c.data.filter((x: any) => pred(x.createTime)).map((x: any) => x.orderNumber);
    return { count: ids.length, distinct: new Set(ids).size, c };
  };
  const truth = ORDERS.filter((x) => x.createTime <= after && makePlanPredicate(p1)(x.createTime)).length;
  gate.clear();
  r.setOptions(opts(p1.recent, true, 60000, gate) as any); o.setOptions(opts(p1.older, true, 1800000, gate) as any);
  await tick();
  const bothOld = shown(p1);
  const keys = [...gate.keys()];
  const rk = JSON.stringify(dashboardReadOptionsBase("acc", 1, p1.recent, true, 60000).queryKey);
  const ok = keys.find((k) => k !== rk)!;
  expect(keys).toContain(rk); expect(ok).toBeTruthy();
  if (first === "fail-older") {
    gate.get(rk)!.resolve(1); gate.get(ok)!.resolve("fail"); await tick(); await tick();
    const s = shown(p1);
    u1(); u2(); qc.clear();
    return { truth, s };
  }
  gate.get(first === "recent" ? rk : ok)!.resolve(1); await tick(); await tick();
  const one = shown(p1);
  gate.get(first === "recent" ? ok : rk)!.resolve(1); await tick(); await tick();
  const both = shown(p1);
  u1(); u2(); qc.clear();
  return { truth, bothOld, one, both, p0, p1 };
}

describe("V1a · R1 · 00:00 IST, both landing orders, real observers", () => {
  const periods: [string, TimeFilter][] = [
    ["7D", { mode: "7d", shift: "all" }],
    ["30D", { mode: "30d", shift: "all" }],
    ["7D + Morning", { mode: "7d", shift: "shift2" }],
    ["1Y", { mode: "1y", shift: "all" }],
    ["1Y + Evening", { mode: "1y", shift: "shift3" }],
  ];
  for (const [name, f] of periods) {
    for (const first of ["recent", "older"] as const) {
      it(`${name} · ${first} first`, async () => {
        const x = await midnight(f, first);
        expect(x.p0.older).not.toBeNull(); expect(x.p1.older).not.toBeNull();
        expect(readKey(x.p0.recent)).not.toBe(readKey(x.p1.recent));
        for (const s of [x.bothOld!, x.one!, x.both!]) {
          expect(s.count).toBe(x.truth);
          expect(s.distinct).toBe(s.count);
        }
        console.log(`T3 | ${TZ} | ${name} | ${first} first | ${x.bothOld!.count} / ${x.one!.count} / ${x.both!.count} | truth ${x.truth} | dup ${x.both!.count - x.both!.distinct + x.one!.count - x.one!.distinct + x.bothOld!.count - x.bothOld!.distinct}`);
      });
    }
  }
  it("a part failing after the change says the figures may be incomplete", async () => {
    const x = await midnight({ mode: "7d", shift: "all" }, "fail-older");
    expect(x.s.c.isError).toBe(true);
    expect(x.s.c.failed).toEqual({ recent: false, older: true });
    // dataUpdatedAt 0 for the failed part → the page shows "couldn't be loaded … may be incomplete".
    expect(x.s.c.dataUpdatedAt).toBe(0);
    console.log(`T3 | ${TZ} | 7D | older fails | rows ${x.s.count} (truth ${x.truth}) | strip: may be incomplete | dup ${x.s.count - x.s.distinct}`);
  });
});

// ───────────────────────── V1b · plan simulation, 72 h in 60 s steps ─────────────────────────
const T0 = ist(2026, 10, 15, 16, 40);
const SIM: [string, TimeFilter, { oneDay?: boolean; range?: boolean }][] = [
  ["Today", { mode: "1d", date: day(2026, 10, 15), shift: "all" }, { oneDay: true }],
  ["Today + Evening", { mode: "1d", date: day(2026, 10, 15), shift: "shift3" }, { oneDay: true }],
  ["Today + Night", { mode: "1d", date: day(2026, 10, 15), shift: "shift1" }, { oneDay: true }],
  ["10 Oct", { mode: "1d", date: day(2026, 10, 10), shift: "all" }, { oneDay: true }],
  ["5–12 Oct", { mode: "range", from: day(2026, 10, 5), to: day(2026, 10, 12), shift: "all" }, { range: true }],
  ["10 Oct – today", { mode: "range", from: day(2026, 10, 10), to: day(2026, 10, 15), shift: "all" }, { range: true }],
  ["1 Aug – today", { mode: "range", from: day(2026, 8, 1), to: day(2026, 10, 15), shift: "all" }, { range: true }],
  ["1 Aug – today + Evening", { mode: "range", from: day(2026, 8, 1), to: day(2026, 10, 15), shift: "shift3" }, { range: true }],
  ["7D", { mode: "7d", shift: "all" }, {}],
  ["7D + Morning", { mode: "7d", shift: "shift2" }, {}],
  ["30D", { mode: "30d", shift: "all" }, {}],
  ["30D + Night", { mode: "30d", shift: "shift1" }, {}],
  ["1Y", { mode: "1y", shift: "all" }, {}],
  ["1Y + Evening", { mode: "1y", shift: "shift3" }, {}],
];
const SIM_ORDERS = makeOrders(ist(2026, 7, 20), T0 + 72 * H);

describe("V1b · 72 h in 60 s steps from 15 Oct 16:40 IST (split and choice held)", () => {
  for (const [name, f, kind] of SIM) {
    it(name, () => {
      const held = sealedCutoffAt(T0);
      let prev = planDashboardPeriod(f, T0, held, T0);
      const at2359 = planDashboardPeriod(f, ist(2026, 10, 15, 23, 59), held, T0);
      const at0000 = planDashboardPeriod(f, ist(2026, 10, 16), held, T0);
      const histChanges: string[] = []; let summaryChanges24 = 0; const afterEnd: string[] = []; let oneDayOlder = 0;
      let maxOverlap = 0;
      for (let now = T0 + 60000; now <= T0 + 72 * H; now += 60000) {
        const p = planDashboardPeriod(f, now, held, T0);
        const histChanged = readKey(p.recent) !== readKey(prev.recent) || (p.older ? readKey(p.older) : "") !== (prev.older ? readKey(prev.older) : "");
        const sumChanged = summaryKey(p) !== summaryKey(prev);
        if (histChanged) {
          histChanges.push(fmt(now));
          expect(prev.live).toBe(true);                       // only while live
          expect(istDayStart(now)).toBe(now);                 // only at 00:00 IST
        }
        if (sumChanged && now <= T0 + 24 * H) summaryChanges24++;
        if ((histChanged || sumChanged) && !prev.live) afterEnd.push(fmt(now));
        if (kind.range) expect(sumChanged).toBe(false);
        if (kind.oneDay && p.older) oneDayOlder++;
        if (!prev.older && p.older) throw new Error(`${name}: time turned on the older part at ${fmt(now)}`);
        // Parts cover the read range; overlap at most one IST day.
        if (p.older) {
          expect(p.older.startTimestamp).toBeLessThan(p.recent.startTimestamp);
          expect(p.older.endTimestamp! + 1).toBeGreaterThanOrEqual(p.recent.startTimestamp);
          const ov = p.older.endTimestamp! + 1 - p.recent.startTimestamp;
          expect(ov).toBeLessThanOrEqual(DAY);
          maxOverlap = Math.max(maxOverlap, ov);
        }
        // The read never starts later than the trimmed window.
        const readStart = Math.min(p.recent.startTimestamp, p.older?.startTimestamp ?? Infinity);
        const firstWin = Math.min(...p.windows.map((w) => w.start));
        expect(readStart).toBeLessThanOrEqual(Math.max(firstWin, p.usesSummary ? p.sealedCutoff + 1 : -Infinity));
        // Trimmed rows equal a fresh load at that minute (every 30 min to keep the run short).
        if ((now - T0) % (30 * 60000) === 0) {
          const pred = makePlanPredicate(p);
          const got = SIM_ORDERS.filter((o) => o.createTime <= now && (inRange(p.recent, o.createTime) || (p.older && inRange(p.older, o.createTime))) && pred(o.createTime)).length;
          const fresh = buildShiftWindows(f, now);
          const want = SIM_ORDERS.filter((o) => o.createTime <= now && (!p.usesSummary || o.createTime > p.sealedCutoff) && fresh.some((w) => o.createTime >= w.start && o.createTime <= w.end)).length;
          const rollingShift = (f.mode === "7d" || f.mode === "30d" || f.mode === "1y") && f.shift !== "all";
          if (TZ === "Asia/Kolkata" || !rollingShift) expect(got).toBe(want);
        }
        prev = p;
      }
      expect(afterEnd).toEqual([]);
      expect(oneDayOlder).toBe(0);
      const parts = (p: DashboardPeriodPlan) => `${p.recent ? 1 : 0}/${p.older ? 1 : 0}`;
      console.log(`T2 | ${TZ} | ${name} | ${parts(at2359)} | ${parts(at0000)} | overlap ${maxOverlap / H} h | hist changes: ${histChanges.join(", ") || "none"} | summary changes 24h: ${summaryChanges24} | after end: none | one-day older: none`);
    });
  }

  it("past day / past range chosen after they ended: one key each, main's plan (V7)", () => {
    for (const f of [SIM[3][1], SIM[4][1]]) {
      const held = sealedCutoffAt(T0); const keys = new Set<string>();
      for (let now = T0; now <= T0 + 72 * H; now += 60000) {
        const p = planDashboardPeriod(f, now, held, T0);
        expect(p.older).toBeNull(); expect(p.scheduled).toBe(false);
        keys.add(readKey(p.recent));
      }
      expect(keys.size).toBe(1);
      const w = buildShiftWindows(f, T0);
      expect([...keys][0]).toBe(`${Math.min(...w.map((x) => x.start))}|${Math.max(...w.map((x) => x.end))}`);
    }
  });

  it("summary: 1Y all day changes each half hour, 1Y + shift once per IST day", () => {
    const held = sealedCutoffAt(T0);
    const count = (f: TimeFilter) => { let n = 0, prev = summaryKey(planDashboardPeriod(f, T0, held, T0)); for (let t = T0 + 60000; t <= T0 + 24 * H; t += 60000) { const k = summaryKey(planDashboardPeriod(f, t, held, T0)); if (k !== prev) n++; prev = k; } return n; };
    expect(count({ mode: "1y", shift: "all" })).toBe(48);
    expect(count({ mode: "1y", shift: "shift3" })).toBeLessThanOrEqual(1);
  });
});

// ───────────────────────── V1c · R4 first switch ─────────────────────────
describe("V1c · R4 · Today → 7D while the older part loads for the first time", () => {
  async function run(todayRows: number) {
    const qc = new QueryClient();
    const mk = (key: any[], enabled: boolean, fn: () => Promise<any>) => ({ queryKey: key, enabled, queryFn: fn, placeholderData: (p: any) => p, staleTime: 60000, retry: false });
    const g7r = deferred<any>(), g7o = deferred<any>();
    const recent = new QueryObserver<any>(qc, mk(["r", "today"], true, async () => Array.from({ length: todayRows }, (_, i) => ({ orderNumber: `t${i}`, createTime: T0 - i * 60000 }))) as any);
    const older = new QueryObserver<any>(qc, mk(["o", null], false, async () => []) as any);
    const u1 = recent.subscribe(() => {}), u2 = older.subscribe(() => {}); await tick(); await tick();
    recent.setOptions(mk(["r", "7d"], true, () => g7r.p) as any); older.setOptions(mk(["o", "7d"], true, () => g7o.p) as any); await tick();
    const during = combineDashboardParts(recent.getCurrentResult() as any, older.getCurrentResult() as any);
    g7r.resolve([{ orderNumber: "a", createTime: T0 }]); g7o.resolve([{ orderNumber: "b", createTime: T0 - 3 * DAY }]); await tick(); await tick();
    const after = combineDashboardParts(recent.getCurrentResult() as any, older.getCurrentResult() as any);
    u1(); u2(); qc.clear();
    return { during, after };
  }
  it("rows on Today: not loading, placeholder (Updating…); after both land neither", async () => {
    const { during, after } = await run(2);
    expect(during.isLoading).toBe(false); expect(during.isPlaceholderData).toBe(true); expect(during.data.length).toBe(2);
    expect(after.isLoading).toBe(false); expect(after.isPlaceholderData).toBe(false); expect(after.data.length).toBe(2);
    console.log(`V1c | rows 2 → during ${JSON.stringify({ loading: during.isLoading, ph: during.isPlaceholderData, rows: during.data.length })} after ${JSON.stringify({ loading: after.isLoading, ph: after.isPlaceholderData })}`);
  });
  it("0 rows on Today: placeholder with no rows → periodPending (shimmer)", async () => {
    const { during } = await run(0);
    const periodPending = during.isPlaceholderData && during.data.length === 0;
    expect(during.isLoading).toBe(false); expect(periodPending).toBe(true);
  });
});

// ───────────────────────── V1d · R3 hidden tab ─────────────────────────
describe("V1d · R3 · clock while hidden", () => {
  it("hidden 2 h across 00:00 IST: no advance, no fetch; a landed read doesn't advance; visible advances once", async () => {
    let t = ist(2026, 10, 15, 23, 10), visible = false, changes = 0;
    const clock = createDashboardClock(() => visible, () => t, () => { changes++; });
    const start = clock.now;
    const qc = new QueryClient(); let fetches = 0;
    const f: TimeFilter = { mode: "7d", shift: "all" };
    const held = sealedCutoffAt(start);
    const o = (p: DashboardPeriodPlan) => ({ queryKey: ["r", readKey(p.recent)], queryFn: async () => { fetches++; return []; }, staleTime: 60000, retry: false });
    const obs = new QueryObserver<any>(qc, o(planDashboardPeriod(f, clock.now, held, start)) as any);
    const u = obs.subscribe(() => {}); await tick(); await tick();
    const base = fetches;
    for (let i = 0; i < 120; i++) { t += 60000; clock.tick(); obs.setOptions(o(planDashboardPeriod(f, clock.now, held, start)) as any); }
    clock.tick(); // a read that landed while hidden
    await tick();
    expect(clock.now).toBe(start); expect(changes).toBe(0); expect(fetches).toBe(base);
    visible = true; clock.visibilityChanged();
    obs.setOptions(o(planDashboardPeriod(f, clock.now, held, start)) as any); await tick(); await tick();
    expect(changes).toBe(1); expect(clock.now).toBe(t); expect(fetches).toBe(base + 1);
    u(); qc.clear();
  });
});

// ───────────────────────── V1e · R5 year labels + split day ─────────────────────────
describe("V1e · R5 · day series", () => {
  const dayKey = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
  const span = (from: [number, number, number], to: [number, number, number]) => {
    const out: { day: string; buy: number; sell: number }[] = [];
    for (let t = Date.UTC(...(from.map((v, i) => (i === 1 ? v - 1 : v)) as [number, number, number])); t <= Date.UTC(to[0], to[1] - 1, to[2]); t += DAY) out.push({ day: new Date(t).toISOString().slice(0, 10), buy: 1, sell: 1 });
    return out;
  };
  it("28 Oct 2025 – 28 Oct 2026 (366 days) → year labels", () => {
    const s = buildDaySeries(span([2025, 10, 28], [2026, 10, 28]), []);
    expect(s.length).toBe(366); expect(s[0].date).toBe("28 Oct 25"); expect(s[s.length - 1].date).toBe("28 Oct 26");
  });
  it("29 Oct 2025 – 28 Oct 2026 → no year", () => {
    const s = buildDaySeries(span([2025, 10, 29], [2026, 10, 28]), []);
    expect(s[0].date).toBe("29 Oct"); expect(s[0].full).toBe("29 Oct 2025");
  });
  it("1Y: data on the partial first day sharing today's day-month → year; without → no year", () => {
    const pre = span([2025, 10, 29], [2026, 9, 12]);
    const today = { createTime: ist(2026, 10, 28, 12), tradeType: "BUY", totalPrice: "100" };
    expect(buildDaySeries([{ day: dayKey(2025, 10, 28), buy: 5, sell: 0 }, ...pre], [today]).at(-1)!.date).toBe("28 Oct 26");
    expect(buildDaySeries(pre, [today]).at(-1)!.date).toBe("28 Oct");
  });
  it("split day: pre-computed + raw for the same day → one point, summed", () => {
    const s = buildDaySeries([{ day: "2026-08-31", buy: 100, sell: 50 }], [
      { createTime: ist(2026, 8, 31, 23, 45), tradeType: "BUY", totalPrice: "10" },
      { createTime: ist(2026, 8, 31, 23, 50), tradeType: "SELL", totalPrice: "5" },
    ]);
    expect(s).toEqual([{ date: "31 Aug", full: "31 Aug 2026", buy: 110, sell: 55 }]);
  });
});

// ───────────────────────── V1f · R6 ─────────────────────────
describe("V1f · R6 · summary appeals only from the non-final group", () => {
  const row = (g: string, appeal: number): OrderSummaryRow => ({ day_ist: "2026-08-01", trade_type: "BUY", status_group: g, order_count: 10, fiat_volume: 1000, appeal_count: appeal } as any);
  it("final groups add 0; OTHER counts; other figures unchanged", () => {
    const rows = ["COMPLETED", "CANCELLED", "AUTO_CANCELLED", "EXPIRED"].map((g) => row(g, 3));
    const a = aggregateSummaryRows(rows);
    expect(a.appeals).toBe(0);
    const b = aggregateSummaryRows([...rows, row("OTHER", 2)]);
    expect(b.appeals).toBe(2);
    const z = aggregateSummaryRows(rows.map((r) => ({ ...r, appeal_count: 0 })));
    expect({ ...a, appeals: 0 }).toEqual({ ...z, appeals: 0 });
    expect(a.totalOrders).toBe(40); expect(a.completedCount).toBe(10); expect(a.cancelledCount).toBe(20); expect(a.expiredCount).toBe(10);
  });
});

// ───────────────────────── V1g · "Up to" stays gone ─────────────────────────
describe("V1g · no 'Up to' on the dashboard", () => {
  it("TerminalDashboard.tsx and dashboard/*.tsx", () => {
    const root = path.resolve(__dirname, "../../../..");
    const dir = path.join(root, "src/components/terminal/dashboard");
    const files = [path.join(root, "src/pages/terminal/TerminalDashboard.tsx"), ...readdirSync(dir).filter((f) => f.endsWith(".tsx")).map((f) => path.join(dir, f))];
    for (const f of files) expect(/up to/i.test(readFileSync(f, "utf8")), f).toBe(false);
  });
});

// ───────────────────────── V1h · R9 trim cost ─────────────────────────
describe("V1h · R9 · 1Y + Evening plan + one trim pass per tick", () => {
  it("after ≤ 1/5 of before, same result", () => {
    const now = ist(2026, 10, 15, 16, 40), held = sealedCutoffAt(now);
    const rows = Array.from({ length: 11518 }, (_, i) => held + 1 + Math.floor((i / 11518) * (now - held)));
    const f: TimeFilter = { mode: "1y", shift: "shift3" };
    const naive = (p: DashboardPeriodPlan) => (ts: number) => (!p.usesSummary || ts > p.sealedCutoff) && p.windows.some((w) => ts >= w.start && ts <= w.end);
    const time = (mk: (p: DashboardPeriodPlan) => (ts: number) => boolean) => {
      let n = 0; const t = performance.now();
      for (let k = 0; k < 20; k++) { const p = planDashboardPeriod(f, now + k * 60000, held, now); const pred = mk(p); for (const r of rows) if (pred(r)) n++; }
      return { ms: (performance.now() - t) / 20, n };
    };
    time(naive); time(makePlanPredicate); // warm-up
    const before = time(naive), after = time(makePlanPredicate);
    console.log(`V1h | ${TZ} | before ${before.ms.toFixed(2)} ms, after ${after.ms.toFixed(2)} ms per tick (${rows.length} rows, ${planDashboardPeriod(f, now, held).windows.length} windows)`);
    expect(after.n).toBe(before.n);
    expect(after.ms).toBeLessThanOrEqual(before.ms / 5);
    // exactness over every minute of the year for a sample of the plan
    const p = planDashboardPeriod(f, now, held, now); const a = naive(p), b = makePlanPredicate(p);
    for (let t = held - 2 * DAY; t <= now + DAY; t += 60000) expect(b(t)).toBe(a(t));
  });
});

// ───────────────────────── V1i · R7 ─────────────────────────
describe("V1i · R7 · top-ads empty lines", () => {
  const ad = (side: string, price: string | null, fiat = "INR") => ({ advNo: side + price, tradeType: side, surplusAmount: "10", price, fiatUnit: fiat });
  it("ads but none online", () => {
    expect(topAdsEmptyLines([ad("SELL", "100")], [])).toEqual({ lists: true, sell: "No online sell ads", buy: "No online buy ads" });
  });
  it("online sell ads, none valued", () => {
    const online = [ad("SELL", null), ad("SELL", "100", "USD")];
    expect(topAdsEmptyLines(online, online).sell).toBe("No sell ads with a rupee price");
    expect(topAdsEmptyLines(online, online).buy).toBe("No online buy ads");
  });
  it("valued ads on both sides → lists render (rows replace the line)", () => {
    const online = [ad("SELL", "100"), ad("BUY", "90")];
    expect(topAdsEmptyLines(online, online).lists).toBe(true);
  });
  it("no ads at all → no lists (widget says 'No ads returned by Binance.')", () => {
    expect(topAdsEmptyLines([], []).lists).toBe(false);
  });
});

// ───────────────────────── V1j · R8 ─────────────────────────
describe("V1j · R8 · Retry busy and scope", () => {
  const part = (o: Partial<{ isError: boolean; isFetching: boolean }>) => ({ data: [], isLoading: false, isPlaceholderData: false, isError: false, isFetching: false, dataUpdatedAt: 1, ...o });
  it("older failed + recent fetching → not busy; older failed and running again → busy", () => {
    expect(combineDashboardParts(part({ isFetching: true }), part({ isError: true })).retryBusy).toBe(false);
    expect(combineDashboardParts(part({}), part({ isError: true, isFetching: true })).retryBusy).toBe(true);
  });
  it("Retry re-runs only the failed part", () => {
    const r = { isError: false, refetch: vi.fn() }, o = { isError: true, refetch: vi.fn() };
    retryFailedParts(r, o);
    expect(r.refetch).not.toHaveBeenCalled(); expect(o.refetch).toHaveBeenCalledTimes(1);
  });
});
