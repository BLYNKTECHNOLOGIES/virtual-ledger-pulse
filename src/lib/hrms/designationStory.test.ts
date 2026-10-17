// @ts-nocheck — run with `bun run test` (vitest)
import { describe, expect, test } from "vitest";
import { deriveStaffingRow } from "./workforce";
import { buildDesignationStory } from "./designationStory";

const base = {
  plan_id: "p", department_id: "d", department_name: "Operations", position_id: "oa",
  position_title: "Operations Associate", shift_id: null, shift_name: null, location: null,
  employment_type: "full_time", approved_hc: 8, required_hc: 8, current_hc: 0, physical_seats: 8,
  pipeline_hc: 0, selected_hc: 0, pending_joining_hc: 0, notice_period_hc: 0, target_date: null,
  priority: "medium", open_requirement_count: 0, open_requirement_hc: 0, shift_group_name: null,
  seat_capacity_id: "g1", follow_desks: true, in_training_hc: 0, training_ready_date: null,
  over_requested_hc: 0, role_ids: ["oa"],
};
const line = (o) => deriveStaffingRow({ ...base, ...o });
const oa = { id: "oa", title: "Operations Associate", department_id: "d", is_active: true, in_workforce_planning: true };
const seats = [
  { id: "g1", department_id: "d", position_id: "oa", eligible_position_ids: [], physical_seats: 8, max_operational_capacity: 8 },
  { id: "g2", department_id: "d", position_id: "kyc", eligible_position_ids: [], physical_seats: 2 },
  { id: "tr", department_id: "d", position_id: null, physical_seats: 6, is_training_only: true },
];
const lines = [
  line({ plan_id: "m", shift_group_name: "Morning", current_hc: 4, open_requirement_hc: 4 }),
  line({ plan_id: "e", shift_group_name: "Evening", current_hc: 7, in_training_hc: 1 }),
  line({ plan_id: "n", shift_group_name: "Night", current_hc: 0, open_requirement_hc: 8 }),
  line({ plan_id: "k", position_id: "kyc", role_ids: ["kyc"], seat_capacity_id: "g2", shift_group_name: "Morning" }),
];
const requests = [
  { id: "r1", requirement_no: "HR-1", status: "recruitment_active", position_id: "oa", staffing_plan_id: "m", number_required: 4 },
  { id: "r2", requirement_no: "HR-2", status: "approved", position_id: "oa", staffing_plan_id: "n", number_required: 8 },
  { id: "r3", requirement_no: "HR-3", status: "cancelled", position_id: "oa", staffing_plan_id: "n", number_required: 2 },
  { id: "r9", requirement_no: "HR-9", status: "pending_approval", position_id: "kyc", staffing_plan_id: "k", number_required: 8 },
];
const jobs = new Map([["r1", [{ id: "j2", job_code: "JOB-0002", status: "open", openings: 12 }]], ["r2", [{ id: "j2", job_code: "JOB-0002", status: "open", openings: 12 }]]]);

describe("designation journey", () => {
  const s = buildDesignationStory({ designation: oa, status: { status: "planned", line_count: 3 }, lines, seats, requests, jobsByRequest: jobs });

  test("lines follow the rota order", () => {
    const x = buildDesignationStory({ designation: oa, status: { status: "planned", line_count: 3 }, lines, seats, requests, jobsByRequest: jobs,
      shiftOrder: ["Night", "Morning", "Evening"] });
    expect(x.lines.map((l) => l.shiftLabel)).toEqual(["Night", "Morning", "Evening"]);
    expect(x.desks[0].sets.map((t) => t.shift)).toEqual(["Night", "Morning", "Evening"]);
  });

  test("while ATS jobs load, approved requests don't look jobless", () => {
    const x = buildDesignationStory({ designation: oa, status: { status: "planned", line_count: 3 }, lines, seats, requests, jobsByRequest: null });
    expect(x.next.kind).toBe("unknown");
    expect(x.steps.find((t) => t.key === "recruit").state).toBe("info");
  });

  test("collects only this designation's lines, desks, requests and jobs", () => {
    expect(s.lines.map((l) => l.plan_id)).toEqual(["m", "e", "n"]);
    expect(s.desks.map((d) => d.id)).toEqual(["g1"]);
    expect(s.desks[0].sets.map((x) => `${x.shift} ${x.required}`)).toEqual(["Morning 8", "Evening 8", "Night 8"]);
    expect(s.openRequests.map((q) => q.id)).toEqual(["r1", "r2"]);
    expect(s.closedRequests).toBe(1);
    expect(s.jobs.map((j) => `${j.job_code}:${j.requestIds.join("+")}`)).toEqual(["JOB-0002:r1+r2"]);
  });

  test("totals add up the lines", () => {
    expect(s.totals.required).toBe(24);
    expect(s.totals.onRoll).toBe(11);
    expect(s.totals.short).toBe(13);
    expect(s.totals.onTheWay).toBe(1);
    expect(s.totals.stillToFind).toBe(12);
    expect(s.totals.notRequested).toBe(0);
  });

  test("checklist and next step: recruiting", () => {
    expect(s.steps.map((x) => `${x.key}:${x.state}`)).toEqual(["decision:done", "desks:done", "lines:done", "gap:todo", "hiring:done", "recruit:done"]);
    expect(s.next.kind).toBe("recruit");
    expect(s.next.jobId).toBe("j2");
  });

  test("an approved request with no live job asks for an ATS job", () => {
    const x = buildDesignationStory({ designation: oa, status: { status: "planned", line_count: 3 }, lines, seats, requests,
      jobsByRequest: new Map([["r1", [{ id: "j2", status: "open" }]], ["r2", [{ id: "j5", status: "draft" }]]]) });
    expect(x.next.kind).toBe("job");
    expect(x.next.requestId).toBe("r2");
    expect(x.draftJobs.map((j) => j.id)).toEqual(["j5"]);
    expect(x.next.text).toContain("draft job");
  });

  test("a request awaiting approval comes first", () => {
    const kyc = { id: "kyc", title: "KYC Associate", department_id: "d", is_active: true, in_workforce_planning: true };
    const x = buildDesignationStory({ designation: kyc, status: { status: "planned", line_count: 1 }, lines, seats, requests, jobsByRequest: jobs });
    expect(x.next.kind).toBe("approve");
    expect(x.next.requestId).toBe("r9");
    expect(x.steps.find((t) => t.key === "hiring").state).toBe("todo");
  });

  test("not decided blocks hiring and asks for a decision", () => {
    const x = buildDesignationStory({ designation: { ...oa, id: "new" }, status: { status: "undecided", line_count: 0 }, lines, seats, requests, jobsByRequest: jobs });
    expect(x.lines).toHaveLength(0);
    expect(x.next.kind).toBe("decide");
    expect(x.steps[0].state).toBe("blocked");
    expect(x.steps.find((t) => t.key === "lines").state).toBe("blocked");
  });

  test("outside planning stops after the decision", () => {
    const x = buildDesignationStory({ designation: { ...oa, id: "ceo", in_workforce_planning: false }, status: { status: "outside", line_count: 0 }, lines, seats, requests, jobsByRequest: jobs });
    expect(x.steps).toHaveLength(1);
    expect(x.next.kind).toBe("outside");
  });

  test("held-back hiring points to the line", () => {
    const held = [line({ plan_id: "m", shift_group_name: "Morning", current_hc: 4, auto_paused_at: "2026-10-10T00:00:00Z", auto_paused_need: 4 })];
    const x = buildDesignationStory({ designation: oa, status: { status: "planned", line_count: 1 }, lines: held, seats, requests: [], jobsByRequest: new Map() });
    expect(x.next.kind).toBe("raise");
    expect(x.next.planId).toBe("m");
  });

  test("trainees and joiners covering the gap: nothing to hire", () => {
    const cov = [line({ plan_id: "m", current_hc: 6, in_training_hc: 1, pending_joining_hc: 1 })];
    const x = buildDesignationStory({ designation: oa, status: { status: "planned", line_count: 1 }, lines: cov, seats, requests: [], jobsByRequest: new Map() });
    expect(x.next.kind).toBe("join");
    expect(x.steps.find((t) => t.key === "gap").text).toContain("gap covered");
  });

  test("fully staffed, shared line marked", () => {
    const shared = [line({ plan_id: "s", current_hc: 9, role_ids: ["oa", "oe"] })];
    const x = buildDesignationStory({ designation: oa, status: { status: "planned", line_count: 1 }, lines: shared, seats, requests: [], jobsByRequest: new Map() });
    expect(x.lines[0].shared).toBe(true);
    expect(x.next.kind).toBe("staffed");
    expect(x.next.text).toContain("1 extra");
  });
});
