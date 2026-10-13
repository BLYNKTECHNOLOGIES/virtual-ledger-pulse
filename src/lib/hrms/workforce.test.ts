// @ts-nocheck — run with `bun test src/lib/hrms/workforce.test.ts`
import { describe, expect, test } from "bun:test";
import { deriveStaffingRow, findRebalances, sortByOperatingOrder, sumLines } from "./workforce";

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
});
