import { describe, expect, test } from "vitest";
import { autoPriority, deriveStaffingRow, matchesFilters, EMPTY_FILTERS, type StaffingMatrixRow } from "./workforce";

const today = "2026-10-17";

describe("automatic line priority (WF7 §1)", () => {
  test("nobody needed → low", () => {
    expect(autoPriority({ required: 8, net: 0, staffed: 8, target: "2026-10-18", today }).priority).toBe("low");
  });
  test("target within 7 days → critical", () => {
    expect(autoPriority({ required: 8, net: 1, staffed: 7, target: "2026-10-24", today })).toEqual({ priority: "critical", why: "target joining date in 7 days" });
  });
  test("target already passed → critical", () => {
    expect(autoPriority({ required: 8, net: 1, staffed: 7, target: "2026-10-15", today }).priority).toBe("critical");
  });
  test("empty line with no target → critical", () => {
    expect(autoPriority({ required: 4, net: 4, staffed: 0, target: null, today })).toEqual({ priority: "critical", why: "nobody on this line yet" });
  });
  test("empty line with a future target is not critical until 7 days before", () => {
    expect(autoPriority({ required: 4, net: 4, staffed: 0, target: "2026-11-12", today }).priority).toBe("high");
    expect(autoPriority({ required: 4, net: 4, staffed: 0, target: "2026-11-12", today: "2026-11-05" }).priority).toBe("critical");
  });
  test("half or more still needed → high", () => {
    expect(autoPriority({ required: 8, net: 4, staffed: 4, target: null, today })).toEqual({ priority: "high", why: "4 of 8 still needed" });
  });
  test("target within 15 days → high", () => {
    expect(autoPriority({ required: 8, net: 1, staffed: 7, target: "2026-11-01", today }).priority).toBe("high");
  });
  test("otherwise → medium", () => {
    expect(autoPriority({ required: 8, net: 1, staffed: 7, target: "2026-11-02", today }).priority).toBe("medium");
    expect(autoPriority({ required: 8, net: 3, staffed: 5, target: null, today }).priority).toBe("medium");
  });
});

describe("role filter matches any of a line's roles (WF7 §5.4)", () => {
  const row = deriveStaffingRow({
    plan_id: "p", department_id: "d", department_name: "Ops", position_id: "poa", position_title: "Pool",
    shift_id: null, shift_name: null, location: null, employment_type: "full_time", approved_hc: 4, required_hc: 4,
    current_hc: 0, physical_seats: 0, pipeline_hc: 0, selected_hc: 0, pending_joining_hc: 0, notice_period_hc: 0,
    target_date: null, priority: "high", open_requirement_count: 0, open_requirement_hc: 0, shift_group_name: null,
    seat_capacity_id: null, follow_desks: false, in_training_hc: 0, training_ready_date: null, over_requested_hc: 0,
    role_ids: ["poa", "poe"],
  } as StaffingMatrixRow);
  test("second role matches", () => expect(matchesFilters(row, { ...EMPTY_FILTERS, positionId: "poe" })).toBe(true));
  test("main role matches", () => expect(matchesFilters(row, { ...EMPTY_FILTERS, positionId: "poa" })).toBe(true));
  test("other role does not", () => expect(matchesFilters(row, { ...EMPTY_FILTERS, positionId: "x" })).toBe(false));
});
