// @ts-nocheck — run with `bun run test` (vitest)
import { describe, expect, test } from "vitest";
import { deriveStaffingRow, sumLines } from "./workforce";
import { ATTENTION_STEP, CHAIN_STEPS, chainFigures, gapParts } from "./workforceChain";

const base = {
  plan_id: "p", department_id: "d", department_name: "Operations", position_id: "oa",
  position_title: "Operations Associate", shift_id: null, shift_name: null, location: null,
  employment_type: "full_time", approved_hc: 8, required_hc: 8, current_hc: 0, physical_seats: 8,
  pipeline_hc: 0, selected_hc: 0, pending_joining_hc: 0, notice_period_hc: 0, target_date: null,
  priority: "medium", open_requirement_count: 0, open_requirement_hc: 0, shift_group_name: null,
  seat_capacity_id: null, follow_desks: true, in_training_hc: 0, training_ready_date: null,
  over_requested_hc: 0,
};
const line = (o) => deriveStaffingRow({ ...base, ...o });

describe("gap parts", () => {
  test("every part adds up: required − filling = short; short − on the way = still to find; = in hiring + not requested", () => {
    const rows = [
      line({ plan_id: "m", current_hc: 4, in_training_hc: 1, open_requirement_hc: 3 }),
      line({ plan_id: "e", current_hc: 9 }),
      line({ plan_id: "n", current_hc: 0, selected_hc: 1, pending_joining_hc: 1, open_requirement_hc: 4 }),
    ];
    const g = gapParts(rows);
    expect(g.required).toBe(24);
    expect(g.onRoll).toBe(13);
    expect(g.filling).toBe(12);
    expect(g.extra).toBe(1);
    expect(g.required - g.filling).toBe(g.short);
    expect(g.short).toBe(12);
    expect(g.onTheWay).toBe(3);
    expect(g.training).toBe(1);
    expect(g.joining).toBe(2);
    expect(g.short - g.onTheWay).toBe(g.stillToFind);
    expect(g.stillToFind).toBe(9);
    expect(g.inHiring + g.notRequested).toBe(g.stillToFind);
    expect(g.notRequested).toBe(2);
  });

  test("matches sumLines (same per-line figures, nothing recalculated)", () => {
    const rows = [line({ plan_id: "a", current_hc: 2, in_training_hc: 3 }), line({ plan_id: "b", current_hc: 10, selected_hc: 2 })];
    const g = gapParts(rows);
    const t = sumLines(rows);
    expect(g.short).toBe(t.shortNow);
    expect(g.extra).toBe(t.overNow);
    expect(g.stillToFind).toBe(t.netNeed);
    expect(g.notRequested).toBe(t.uncovered);
  });

  test("people on the way to a full line are not counted against another line's gap", () => {
    const g = gapParts([line({ plan_id: "a", current_hc: 8, pending_joining_hc: 2 }), line({ plan_id: "b", current_hc: 6, in_training_hc: 5 })]);
    expect(g.short).toBe(2);
    expect(g.onTheWay).toBe(2);
    expect(g.training).toBe(2);
    expect(g.joining).toBe(0);
    expect(g.onTheWayExtra).toBe(5);
    expect(g.stillToFind).toBe(0);
  });

  test("held back = the paused number on lines", () => {
    const g = gapParts([line({ plan_id: "a", current_hc: 4, auto_paused_at: "2026-10-01T00:00:00Z", auto_paused_need: 2 })]);
    expect(g.heldBack).toBe(2);
    expect(g.notRequested).toBe(4);
  });
});

describe("chain figures", () => {
  const rows = [
    line({ plan_id: "m", current_hc: 4, open_requirement_hc: 4 }),
    line({ plan_id: "n", current_hc: 0, follow_desks: false, open_requirement_hc: 8 }),
  ];
  const f = chainFigures({
    designations: [{ id: "a", status: "planned" }, { id: "b", status: "undecided" }, { id: "c", status: "outside" }, { id: "d", status: "no_staff_needed" }],
    seats: [{ physical_seats: 8 }, { physical_seats: 6, is_training_only: true }],
    lines: rows,
    openRequests: [{ status: "pending_approval" }, { status: "recruitment_active" }],
    noJob: 1,
    liveJobs: [{ openings: 12 }],
    forecast: { closing: 10, required: 16, lineGap: 6, endLabel: "15 Jan 2027" },
    leaving: 2,
  });

  test("one figure per chain step, in order", () => {
    expect(f.map((x) => x.key)).toEqual(CHAIN_STEPS.map((s) => s.key));
  });
  test("designations: in planning = planned + not decided + no staff needed", () => {
    expect(f[0].value).toBe("3");
    expect(f[0].detail).toBe("1 planned · 1 not decided · 1 no staff needed");
    expect(f[0].flag).toEqual({ text: "1 to decide", tone: "warning" });
  });
  test("desks: training seats are separate", () => {
    expect(f[1].value).toBe("8");
    expect(f[1].detail).toBe("1 desk group · +6 training seats");
    expect(f[1].handoff).toBe("1 line follows its desks");
  });
  test("staffing plan and hiring use the same gap", () => {
    expect(f[2].value).toBe("4 / 16");
    expect(f[2].flag).toEqual({ text: "12 short", tone: "danger" });
    expect(f[2].handoff).toBe("12 still to find go to hiring");
    expect(f[3].value).toBe("12");
    expect(f[3].flag).toEqual({ text: "1 to approve", tone: "warning" });
    expect(f[3].handoff).toBe("1 approved, waiting for an ATS job");
  });
  test("recruit and forecast", () => {
    expect(f[4].value).toBe("1");
    expect(f[4].unit).toBe("ATS job open");
    expect(f[4].flag).toEqual({ text: "1 without a job", tone: "danger" });
    expect(f[5].value).toBe("10 / 16");
    expect(f[5].unit).toBe("by 15 Jan 2027");
    expect(f[5].detail).toBe("6 short then · 2 leaving");
    expect(f[2].detail).toBe("2 lines · 25% staffed");
  });
  test("loading steps have no value", () => {
    const g = chainFigures({ designations: null, seats: null, lines: [], openRequests: null, noJob: null, liveJobs: null, forecast: null });
    expect(g[0].value).toBeNull();
    expect(g[1].value).toBeNull();
    expect(g[3].value).toBeNull();
    expect(g[4].value).toBeNull();
    expect(g[5].value).toBeNull();
  });
  test("every attention topic belongs to a step", () => {
    const keys = new Set(CHAIN_STEPS.map((s) => s.key));
    expect(Object.values(ATTENTION_STEP).every((k) => keys.has(k))).toBe(true);
  });
});
