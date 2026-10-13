// @ts-nocheck — run with `bun run test` (vitest)
import { describe, expect, test } from "vitest";
import { actualAttrition, buildForecast, monthSegments } from "./workforceForecast";

const lines = [
  { plan_id: "a", required_hc: 8, current_hc: 10 },
  { plan_id: "b", required_hc: 8, current_hc: 4 },
];

describe("workforce forecast", () => {
  test("gap is the sum of per-line shortfalls, never netted", () => {
    const f = buildForecast({ today: "2026-10-14", end: "2026-10-31", lines, events: [], includePending: false, attritionPct: 0 });
    // total required 16 − on roll 14 would say 2; line b alone is short 4
    expect(f.totals.lineGap).toBe(4);
  });

  test("90 days from 14 Oct gives three segments, first and last partial", () => {
    const s = monthSegments("2026-10-14", "2027-01-12");
    expect(s.map((x) => x.key)).toEqual(["2026-10", "2026-11", "2026-12", "2027-01"]);
    expect(s[0].partial).toBe(true);
    expect(s[1].partial).toBe(false);
  });

  test("requests awaiting approval count only when switched on", () => {
    const ev = [{ kind: "hire", plan_id: "b", event_date: "2026-10-20", qty: 4, requirement_status: "pending_approval", ref_id: "r" }];
    const off = buildForecast({ today: "2026-10-14", end: "2026-10-31", lines, events: ev, includePending: false, attritionPct: 0 });
    const on = buildForecast({ today: "2026-10-14", end: "2026-10-31", lines, events: ev, includePending: true, attritionPct: 0 });
    expect(off.totals.hires).toBe(0);
    expect(on.totals.hires).toBe(4);
    expect(on.totals.lineGap).toBe(0);
  });

  test("undated hires land in the last month; exits reduce their line", () => {
    const ev = [
      { kind: "hire", plan_id: "b", event_date: null, qty: 2, requirement_status: "approved", ref_id: "r" },
      { kind: "exit", plan_id: "a", event_date: "2026-11-05", qty: 3, ref_id: "e" },
    ];
    const f = buildForecast({ today: "2026-10-14", end: "2026-12-10", lines, events: ev, includePending: false, attritionPct: 0 });
    expect(f.months[2].undatedHires).toBe(2);
    expect(f.months[1].exits).toBe(3);
    // Nov: a=7 (short 1), b=4 (short 4) → 5
    expect(f.months[1].lineGap).toBe(5);
  });

  test("attrition is rate × opening, separate from line gap", () => {
    const f = buildForecast({ today: "2026-11-01", end: "2026-11-30", lines, events: [], includePending: false, attritionPct: 10 });
    expect(f.months[0].attrition).toBe(1); // 10% of 14 = 1.4 → 1
    expect(f.totals.estimatedExtraNeed).toBe(1);
    expect(f.totals.lineGap).toBe(4);
  });

  test("actual attrition = exits ÷ Σ average headcount", () => {
    const r = actualAttrition([
      { month_start: "x", opening_hc: 29, closing_hc: 29, exits: 3, joiners: 3, attrition_pct: 0 },
      { month_start: "y", opening_hc: 29, closing_hc: 35, exits: 5, joiners: 11, attrition_pct: 0 },
    ]);
    expect(r.exits).toBe(8);
    expect(r.pct).toBe(13.1); // 8 / 61 = 13.1%
  });
});
