// @ts-nocheck — run with `bun run test` (vitest)
import { describe, expect, test } from "vitest";
import { deriveStaffingRow, quickRange, requirementMatchesFilters, EMPTY_FILTERS, findRebalances, lineSaveErrorText, pauseText, seatCountsInShift, shiftShort, sortByOperatingOrder, sumLines } from "./workforce";

const base = {
  plan_id: "p", department_id: "d", department_name: "Operations", position_id: "oa",
  position_title: "Operations Associate", shift_id: null, shift_name: null, location: null,
  employment_type: "full_time", approved_hc: 8, required_hc: 8, current_hc: 0, physical_seats: 8,
  pipeline_hc: 0, selected_hc: 0, pending_joining_hc: 0, notice_period_hc: 0, target_date: null,
  priority: "medium", open_requirement_count: 0, open_requirement_hc: 0, shift_group_name: null,
  seat_capacity_id: null, follow_desks: true, in_training_hc: 0, training_ready_date: null,
  over_requested_hc: 0,
};

describe("workforce rules", () => {
  test("net need subtracts on roll, selected, joining and in training", () => {
    const r = deriveStaffingRow({ ...base, current_hc: 3, selected_hc: 1, pending_joining_hc: 1, in_training_hc: 1 });
    expect(r.netHiringRequirement).toBe(2);
  });

  test("uncovered subtracts open requirement people, never below zero", () => {
    expect(deriveStaffingRow({ ...base, current_hc: 4, open_requirement_hc: 3 }).uncoveredHiringRequirement).toBe(1);
    expect(deriveStaffingRow({ ...base, current_hc: 4, open_requirement_hc: 9 }).uncoveredHiringRequirement).toBe(0);
  });

  test("short now is the sum of positive gaps, a surplus never nets a shortage", () => {
    const rows = [
      deriveStaffingRow({ ...base, plan_id: "m", shift_group_name: "Morning", current_hc: 4 }),
      deriveStaffingRow({ ...base, plan_id: "e", shift_group_name: "Evening", current_hc: 9 }),
      deriveStaffingRow({ ...base, plan_id: "n", shift_group_name: "Night", current_hc: 0 }),
    ];
    const t = sumLines(rows);
    expect(t.shortNow).toBe(12);
    expect(t.overNow).toBe(1);
  });

  test("rebalance: Evening over by 1 and Morning short 4 → Morning hiring 3", () => {
    const rows = [
      deriveStaffingRow({ ...base, plan_id: "m", shift_group_name: "Morning", current_hc: 4 }),
      deriveStaffingRow({ ...base, plan_id: "e", shift_group_name: "Evening", current_hc: 9 }),
    ];
    const [hint] = findRebalances(rows);
    expect(hint.movable).toBe(1);
    expect(hint.message).toContain("cuts Morning hiring to 3");
  });

  test("operating order puts shifts starting before 06:00 last", () => {
    const sorted = sortByOperatingOrder([
      { name: "Night", start_time: "00:00:00" },
      { name: "Evening", start_time: "16:00:00" },
      { name: "Morning", start_time: "08:00:00" },
    ]);
    expect(sorted.map((s) => s.name)).toEqual(["Morning", "Evening", "Night"]);
  });

  test("a desk group counts in a shift only when its line there requires more than 0", () => {
    expect(seatCountsInShift({ required_hc: 0 })).toBe(false);
    expect(seatCountsInShift({ required_hc: 8 })).toBe(true);
  });

  test("paused line names who declined, how many and why; unpaused line has no text", () => {
    expect(pauseText({ auto_paused_at: null, auto_paused_by_name: null, auto_paused_reason: null })).toBeNull();
    const t = pauseText({ auto_paused_at: "2026-10-13T10:00:00Z", auto_paused_by_name: "Abhishek", auto_paused_reason: "Night not opening", auto_paused_need: 3 });
    expect(t).toContain("held back for 3");
    expect(t).toContain("by Abhishek");
    expect(t).toContain(": Night not opening");
  });

  test("short shift names never read like a department", () => {
    expect(shiftShort("Morning Shift")).toBe("Morning");
    expect(shiftShort("Management")).toBe("Management shift");
    expect(shiftShort("Any shift")).toBe("Any shift");
    expect(shiftShort(null)).toBe("Any shift");
  });

  test("an exact duplicate line gets plain words", () => {
    expect(lineSaveErrorText({ code: "23505", message: 'duplicate key value violates unique constraint "hr_headcount_plans_scope_uk"' })).toContain("already has an active line");
    expect(lineSaveErrorText({ message: "Pick the desk group this line follows" })).toBe("Pick the desk group this line follows");
    expect(lineSaveErrorText(null, "x")).toBe("x");
  });

  test("replacements for people still on notice do not cover today's empty desks", () => {
    // KYC Associate · Evening: 2 required, 1 on roll (on notice); 1 automatic + 1 replacement open
    const base = { required_hc: 2, current_hc: 1, notice_period_hc: 1, open_requirement_hc: 2 } as any;
    expect(deriveStaffingRow({ ...base, replacement_cover_hc: 1 }).uncoveredHiringRequirement).toBe(0);
    expect(deriveStaffingRow({ ...base, open_requirement_hc: 1, replacement_cover_hc: 1 }).uncoveredHiringRequirement).toBe(1);
  });
});

import { shiftsOutsideLine } from "./workforce";
describe("shiftsOutsideLine", () => {
  const shifts = [
    { id: "m", name: "Morning Shift" }, { id: "mx", name: "Morning Shift Exemption", planning_shift_id: "m" },
    { id: "e", name: "Evening Shift" }, { id: "n", name: "Night Shift" },
  ];
  test("a Morning line covers Morning Exemption but not Evening/Night", () => {
    expect(shiftsOutsideLine(shifts, ["m", "mx", "e", "n"], ["m"]).map((s) => s.id)).toEqual(["e", "n"]);
  });
  test("an any-shift line covers every shift", () => {
    expect(shiftsOutsideLine(shifts, ["e", "n"], [])).toEqual([]);
  });
});

import { istNextDay, trainingEnded, overdueByLine } from "./workforce";
describe("timing helpers", () => {
  test("next day crosses month end", () => { expect(istNextDay("2026-10-31")).toBe("2026-11-01"); });
  test("training ends the day after its completion date", () => {
    expect(trainingEnded("2026-10-13", "2026-10-13")).toBe(false);
    expect(trainingEnded("2026-10-12", "2026-10-13")).toBe(true);
    expect(trainingEnded(null, "2026-10-13")).toBe(false);
  });
  test("overdue joiners grouped per line", () => {
    expect(overdueByLine([{ plan_id: "a" }, { plan_id: "a" }, { plan_id: null }]).get("a")).toBe(2);
  });
});

describe("WF4 filters and alerts", () => {
  test("quick ranges in IST calendar terms", () => {
    expect(quickRange("this_month", "2026-10-14")).toEqual({ fromDate: "2026-10-01", toDate: "2026-10-31" });
    expect(quickRange("next_month", "2026-10-14")).toEqual({ fromDate: "2026-11-01", toDate: "2026-11-30" });
    expect(quickRange("this_quarter", "2026-10-14")).toEqual({ fromDate: "2026-10-01", toDate: "2026-12-31" });
    expect(quickRange("next_90", "2026-10-14")).toEqual({ fromDate: "2026-10-14", toDate: "2027-01-12" });
  });

  test("a requirement follows the department filter through its line", () => {
    const line = deriveStaffingRow({ ...base, plan_id: "p1", department_id: "ops" } as any);
    const lines = new Map([["p1", line]]);
    const f = { ...EMPTY_FILTERS, departmentId: "compliance" };
    expect(requirementMatchesFilters({ staffing_plan_id: "p1", department_id: "ops" }, lines, f)).toBe(false);
    expect(requirementMatchesFilters({ staffing_plan_id: "p1", department_id: "ops" }, lines, { ...EMPTY_FILTERS, departmentId: "ops" })).toBe(true);
    expect(requirementMatchesFilters({ target_joining_date: "2026-11-12" }, lines, { ...EMPTY_FILTERS, ...quickRange("next_90", "2026-10-14") })).toBe(true);
  });

  test("seat capacity reached when a desk-following line has on roll = desks", () => {
    const r = deriveStaffingRow({ ...base, follow_desks: true, operational_capacity: 4, current_hc: 4, required_hc: 4 } as any);
    expect(r.alerts).toContain("Seat capacity reached");
    const r2 = deriveStaffingRow({ ...base, follow_desks: true, operational_capacity: 4, current_hc: 3, required_hc: 4 } as any);
    expect(r2.alerts).not.toContain("Seat capacity reached");
  });
});
