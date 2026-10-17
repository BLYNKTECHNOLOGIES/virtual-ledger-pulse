// @ts-nocheck — run with `bun run test` (vitest)
import { describe, expect, test } from "vitest";
import { deriveStaffingRow, sumLines } from "./workforce";
import { CHAIN_STEPS, gapParts, requestStage, requestWhy, requestWhyShort } from "./workforceChain";

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

describe("hiring requests", () => {
  test("stages follow the status", () => {
    expect(requestStage("pending_approval").index).toBe(0);
    expect(requestStage("approved").index).toBe(1);
    expect(requestStage("recruitment_active").index).toBe(2);
    expect(requestStage("partially_fulfilled").index).toBe(2);
    expect(requestStage("fulfilled").index).toBe(3);
    expect(requestStage("draft")).toEqual({ index: -1, side: "draft" });
    expect(requestStage("cancelled").side).toBe("cancelled");
  });
  test("why an automatic request exists, with the line's numbers", () => {
    const l = line({ plan_id: "n", shift_group_name: "Night Shift", current_hc: 2, in_training_hc: 1 });
    expect(requestWhy({ source: "capacity_occupancy", status: "pending_approval" }, l))
      .toBe("Raised automatically for the Night Shift line: it requires 8, 2 on roll, 1 on the way — 5 still to find. It resizes by itself while it waits for approval.");
    expect(requestWhy({ source: "capacity_occupancy", status: "approved" }, l)).not.toContain("resizes");
    expect(requestWhyShort({ source: "capacity_occupancy" }, l)).toBe("line: 2 of 8 on roll");
  });
  test("other sources", () => {
    expect(requestWhy({ source: "department_request", requested_by_name: "A. Head", adds_headcount: 2 })).toContain("add 2 beyond");
    expect(requestWhy({ source: "employee_separation", replacement: { first_name: "Ravi", last_name: "K" } })).toContain("Replaces Ravi K");
    expect(requestWhy({ source: "manual", requested_by_name: "HR" })).toBe("Raised by hand by HR.");
    expect(requestWhyShort({ source: "department_request", adds_headcount: 3 })).toBe("adds +3");
  });
});

describe("the chain", () => {
  test("six steps in order, each with a page to open", () => {
    expect(CHAIN_STEPS.map((x) => x.n)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(CHAIN_STEPS.every((x) => x.to.startsWith("/hrms/"))).toBe(true);
  });
});
