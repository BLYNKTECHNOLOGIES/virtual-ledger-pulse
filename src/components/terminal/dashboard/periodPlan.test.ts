import { describe, expect, it } from "vitest";
import {
  isUserChangePending, makePlanPredicate, planDashboardPeriod, readKey, sealedCutoffAt, summaryKey,
} from "./periodPlan";
import { getTimestampsForFilter, type TimeFilter } from "./TimePeriodFilter";

// Run with TZ=Asia/Kolkata (filter dates are browser-local, as on the page).
const IST = 330 * 60000;
const ist = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0) => Date.UTC(y, mo - 1, d, h, mi, s) - IST;
const day = (y: number, mo: number, d: number) => new Date(y, mo - 1, d);
const T0 = ist(2026, 10, 15, 16, 40);

function simulate(filter: TimeFilter) {
  const held = sealedCutoffAt(T0);
  const recent = new Set<string>(), older = new Set<string>(), summary = new Set<string>();
  for (let now = T0; now <= T0 + 24 * 3600000; now += 60000) {
    const p = planDashboardPeriod(filter, now, held, T0);
    recent.add(readKey(p.recent));
    if (p.older) older.add(readKey(p.older));
    const k = summaryKey(p);
    if (k) summary.add(k);
  }
  return { recent: recent.size, older: older.size, summary: summary.size };
}

describe("F5 · keys over 24 h in 60 s steps", () => {
  const cases: [string, TimeFilter, (r: ReturnType<typeof simulate>) => void][] = [
    ["Today", { mode: "1d", date: day(2026, 10, 15), shift: "all" }, (r) => { expect(r.recent).toBe(1); expect(r.older).toBe(0); expect(r.summary).toBe(0); }],
    ["Today + Evening", { mode: "1d", date: day(2026, 10, 15), shift: "shift3" }, (r) => { expect(r.recent).toBe(1); expect(r.older).toBe(0); }],
    ["Range ending today", { mode: "range", from: day(2026, 10, 10), to: day(2026, 10, 15), shift: "all" }, (r) => { expect(r.recent).toBeLessThanOrEqual(2); expect(r.older).toBeLessThanOrEqual(2); expect(r.summary).toBe(0); }],
    ["7D", { mode: "7d", shift: "all" }, (r) => { expect(r.recent).toBeLessThanOrEqual(2); expect(r.older).toBeLessThanOrEqual(2); }],
    ["30D", { mode: "30d", shift: "all" }, (r) => { expect(r.recent).toBeLessThanOrEqual(2); expect(r.older).toBeLessThanOrEqual(2); }],
    ["1Y all day", { mode: "1y", shift: "all" }, (r) => { expect(r.recent).toBeLessThanOrEqual(2); expect(r.older).toBeLessThanOrEqual(2); expect([48, 49]).toContain(r.summary); }],
    ["1Y + Evening", { mode: "1y", shift: "shift3" }, (r) => { expect(r.recent).toBeLessThanOrEqual(2); expect(r.older).toBeLessThanOrEqual(2); expect(r.summary).toBeLessThanOrEqual(2); }],
    ["10 Oct", { mode: "1d", date: day(2026, 10, 10), shift: "all" }, (r) => { expect(r).toEqual({ recent: 1, older: 0, summary: 0 }); }],
    ["5–12 Oct", { mode: "range", from: day(2026, 10, 5), to: day(2026, 10, 12), shift: "all" }, (r) => { expect(r).toEqual({ recent: 1, older: 0, summary: 0 }); }],
  ];
  for (const [name, f, check] of cases) {
    it(name, () => { const r = simulate(f); console.log(`${name}: ${JSON.stringify(r)}`); check(r); });
  }

  it("past day / past range read exactly main's plan", () => {
    for (const f of [
      { mode: "1d", date: day(2026, 10, 10), shift: "all" },
      { mode: "range", from: day(2026, 10, 5), to: day(2026, 10, 12), shift: "all" },
    ] as TimeFilter[]) {
      const b = getTimestampsForFilter(f, T0); // main: bounds at selection, no summary (inside 45 days)
      const p = planDashboardPeriod(f, T0, sealedCutoffAt(T0));
      expect(p.live).toBe(false);
      expect(p.scheduled).toBe(false);
      expect(p.usesSummary).toBe(false);
      expect(p.recent).toEqual({ startTimestamp: b.startTimestamp, endTimestamp: b.endTimestamp });
      expect(p.older).toBeNull();
    }
  });
});

describe("F5 · edges", () => {
  it("(a) 7D includes 7 d − 1 min, excludes 7 d + 1 min", () => {
    const p = planDashboardPeriod({ mode: "7d", shift: "all" }, T0, sealedCutoffAt(T0));
    const pred = makePlanPredicate(p);
    expect(pred(T0 - 7 * 86400000 - 60000)).toBe(false);
    expect(pred(T0 - 7 * 86400000 + 60000)).toBe(true);
    expect(p.recent.startTimestamp <= T0 - 7 * 86400000 || p.older!.startTimestamp <= T0 - 7 * 86400000).toBe(true);
  });

  it("(b) Today + Evening: live before start, counts from 17:30, live at 00:30, fixed at 01:01", () => {
    const f: TimeFilter = { mode: "1d", date: day(2026, 10, 15), shift: "shift3" };
    const held = sealedCutoffAt(T0);
    const at1640 = planDashboardPeriod(f, T0, held);
    expect(at1640.live).toBe(true);
    expect(makePlanPredicate(at1640)(T0 - 60000)).toBe(false);
    const ts = ist(2026, 10, 15, 17, 30, 30);
    const at1731 = planDashboardPeriod(f, ist(2026, 10, 15, 17, 31), held);
    expect(makePlanPredicate(at1731)(ts)).toBe(true);
    expect(at1731.recent.startTimestamp).toBeLessThanOrEqual(ts);
    expect(planDashboardPeriod(f, ist(2026, 10, 16, 0, 30), held).live).toBe(true);
    expect(planDashboardPeriod(f, ist(2026, 10, 16, 1, 1), held).live).toBe(false);
  });

  it("(c) Today after midnight: 00:00–24:00, not live, same key", () => {
    const f: TimeFilter = { mode: "1d", date: day(2026, 10, 15), shift: "all" };
    const held = sealedCutoffAt(T0);
    const before = planDashboardPeriod(f, ist(2026, 10, 15, 23, 59), held);
    const after = planDashboardPeriod(f, ist(2026, 10, 16, 0, 5), held);
    expect(after.live).toBe(false);
    expect(after.recent).toEqual({ startTimestamp: ist(2026, 10, 15), endTimestamp: ist(2026, 10, 16) });
    expect(readKey(after.recent)).toBe(readKey(before.recent));
  });

  it("(d) summary windows start before the split, end by it, never empty for a shift", () => {
    for (const f of [{ mode: "1y", shift: "shift3" }, { mode: "1y", shift: "shift1" }, { mode: "1y", shift: "all" }] as TimeFilter[]) {
      const p = planDashboardPeriod(f, T0, sealedCutoffAt(T0));
      expect(p.usesSummary).toBe(true);
      expect(p.summary.windows.length).toBeGreaterThan(0);
      for (const [ws, we] of p.summary.windows) { expect(ws).toBeLessThan(p.sealedCutoff); expect(we).toBeLessThanOrEqual(p.sealedCutoff); }
    }
  });

  it("(e) a row exactly on the split counts once (server raw part only)", () => {
    const p = planDashboardPeriod({ mode: "1y", shift: "all" }, T0, sealedCutoffAt(T0));
    const pred = makePlanPredicate(p);
    expect(pred(p.sealedCutoff)).toBe(false);
    expect(pred(p.sealedCutoff + 1)).toBe(true);
    expect(p.recent.startTimestamp >= p.sealedCutoff && (p.older?.startTimestamp ?? p.recent.startTimestamp) >= p.sealedCutoff).toBe(true);
  });

  it("(f) a time-driven key change is not 'Updating…'; a period change is", () => {
    expect(isUserChangePending("1y|acc", "1y|acc", true)).toBe(false);
    expect(isUserChangePending("7d|acc", "1y|acc", true)).toBe(true);
    expect(isUserChangePending("1y|acc", "1y|acc", false)).toBe(false);
  });
});
