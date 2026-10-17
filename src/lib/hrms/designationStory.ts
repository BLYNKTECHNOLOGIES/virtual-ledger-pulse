/**
 * One designation's journey through the planning chain: its decision, desks, staffing lines, people,
 * gap, hiring requests and ATS jobs, a "ready to hire" checklist and the single next step.
 *
 * Pure: it only reads rows the screens already load (staffing matrix, desk groups, requests, job links)
 * and adds them up with the same per-line figures (deriveStaffingRow), so every number matches the pages.
 */
import { gapParts, type GapParts, type PlanningStatusLike } from "./workforceChain";
import type { StaffingDerived } from "./workforce";

export const OPEN_REQUEST_STATUSES = ["draft", "pending_approval", "approved", "recruitment_active", "partially_fulfilled"] as const;
const HIRING = new Set(["approved", "recruitment_active", "partially_fulfilled"]);
const LIVE_JOB = new Set(["open", "paused"]);

export interface StoryDesignation {
  id: string;
  title: string;
  department_id: string | null;
  hierarchy_level?: number | null;
  reports_to_position_id?: string | null;
  is_active?: boolean | null;
  in_workforce_planning?: boolean | null;
}

export interface StorySeat {
  id: string;
  department_id?: string | null;
  position_id?: string | null;
  eligible_position_ids?: string[] | null;
  physical_seats?: number | null;
  max_operational_capacity?: number | null;
  is_training_only?: boolean | null;
}

export interface StoryRequest {
  id: string;
  requirement_no?: string | null;
  status: string;
  source?: string | null;
  number_required?: number | null;
  positions_filled?: number | null;
  position_id?: string | null;
  staffing_plan_id?: string | null;
  target_joining_date?: string | null;
}

export interface StoryJob {
  id: string;
  job_code?: string | null;
  title?: string | null;
  status: string;
  openings?: number | null;
}

export interface StoryInput {
  designation: StoryDesignation | null;
  /** null while loading. */
  status: { status: PlanningStatusLike; line_count: number } | null;
  lines: StaffingDerived[];
  seats: StorySeat[];
  requests: StoryRequest[];
  /** Jobs per request id; null while loading. */
  jobsByRequest: Map<string, StoryJob[]> | null;
  /** Planning shift names in rota order (Morning → Evening → Night …), to list lines in that order. */
  shiftOrder?: string[];
}

export type StepState = "done" | "todo" | "blocked" | "skip" | "info";
export type StoryStepKey = "decision" | "desks" | "lines" | "gap" | "hiring" | "recruit";

export interface StoryStep {
  key: StoryStepKey;
  label: string;
  state: StepState;
  text: string;
}

export type NextKind =
  | "decide" | "plan" | "approve" | "draft" | "job" | "raise" | "request" | "recruit" | "join" | "staffed" | "outside" | "unknown";

export interface StoryNext {
  kind: NextKind;
  text: string;
  /** What to open: a request, a line or an ATS job. */
  requestId?: string;
  planId?: string;
  jobId?: string;
}

export interface StoryDesk extends StorySeat {
  /** Lines of this designation that take their required number from this group. */
  sets: { planId: string; shift: string; required: number }[];
  shared: boolean;
}

export interface DesignationStory {
  lines: (StaffingDerived & { shared: boolean })[];
  desks: StoryDesk[];
  openRequests: StoryRequest[];
  closedRequests: number;
  jobs: (StoryJob & { requestIds: string[] })[];
  draftJobs: StoryJob[];
  totals: GapParts;
  steps: StoryStep[];
  next: StoryNext;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const roleIds = (r: Pick<StaffingDerived, "position_id" | "role_ids">) => (r.role_ids?.length ? r.role_ids : r.position_id ? [r.position_id] : []);
const seatRoles = (s: StorySeat) => (s.eligible_position_ids?.length ? s.eligible_position_ids : s.position_id ? [s.position_id] : []);

export function buildDesignationStory(input: StoryInput): DesignationStory {
  const id = input.designation?.id ?? "";
  const rank = (label: string) => {
    const i = (input.shiftOrder ?? []).indexOf(label);
    return i < 0 ? 999 : i;
  };
  const lines = input.lines
    .filter((r) => roleIds(r).includes(id))
    .map((r) => ({ ...r, shared: roleIds(r).length > 1 }))
    .sort((a, b) => rank(a.shiftLabel) - rank(b.shiftLabel));
  const planIds = new Set(lines.map((l) => l.plan_id));

  // Desk groups of this designation, plus whole-department groups its lines use.
  const usedSeatIds = new Set(lines.map((l) => l.seat_capacity_id).filter(Boolean) as string[]);
  const desks: StoryDesk[] = input.seats
    .filter((s) => !s.is_training_only && (seatRoles(s).includes(id) || usedSeatIds.has(s.id)))
    .map((s) => ({
      ...s,
      shared: seatRoles(s).length > 1,
      sets: lines.filter((l) => l.seat_capacity_id === s.id && l.follow_desks)
        .map((l) => ({ planId: l.plan_id, shift: l.shiftLabel, required: l.required_hc })),
    }));

  const mine = input.requests.filter((q) => q.position_id === id || (!!q.staffing_plan_id && planIds.has(q.staffing_plan_id)));
  const openRequests = mine.filter((q) => (OPEN_REQUEST_STATUSES as readonly string[]).includes(q.status));
  const closedRequests = mine.length - openRequests.length;

  const jobMap = new Map<string, StoryJob & { requestIds: string[] }>();
  const drafts = new Map<string, StoryJob>();
  for (const q of openRequests) {
    for (const j of input.jobsByRequest?.get(q.id) ?? []) {
      if (LIVE_JOB.has(j.status)) {
        const cur = jobMap.get(j.id) ?? { ...j, requestIds: [] };
        if (!cur.requestIds.includes(q.id)) cur.requestIds.push(q.id);
        jobMap.set(j.id, cur);
      } else if (j.status === "draft") drafts.set(j.id, j);
    }
  }
  const jobs = Array.from(jobMap.values());
  const draftJobs = Array.from(drafts.values());
  const totals = gapParts(lines);

  const st = input.status?.status ?? null;
  const tentative = input.designation?.is_active === false;
  const liveJobsOf = (q: StoryRequest) => (input.jobsByRequest?.get(q.id) ?? []).filter((j) => LIVE_JOB.has(j.status));
  const pending = openRequests.filter((q) => q.status === "pending_approval");
  const draftsReq = openRequests.filter((q) => q.status === "draft");
  const noJob = input.jobsByRequest ? openRequests.filter((q) => HIRING.has(q.status) && liveJobsOf(q).length === 0) : [];
  const recruiting = openRequests.filter((q) => HIRING.has(q.status) && liveJobsOf(q).length > 0);
  const heldLine = lines.find((l) => l.auto_paused_at && l.uncoveredHiringRequirement > 0);
  const uncoveredLine = lines.slice().sort((a, b) => b.uncoveredHiringRequirement - a.uncoveredHiringRequirement)[0];

  // ── The checklist ──
  const steps: StoryStep[] = [];
  const decided = st === "planned";
  steps.push({
    key: "decision", label: "Decision",
    state: st == null ? "info" : st === "planned" ? "done" : st === "outside" ? "skip" : "blocked",
    text: st == null ? "Loading…"
      : st === "planned" ? `Planned · ${plural(input.status!.line_count, "line")}`
      : st === "no_staff_needed" ? "No staff needed now — hiring is blocked"
      : st === "undecided" ? "Not decided — hiring is blocked"
      : "Outside workforce planning",
  });
  if (st === "outside") {
    return {
      lines, desks, openRequests, closedRequests, jobs, draftJobs, totals,
      steps: [...steps],
      next: { kind: "outside", text: tentative
        ? "Tentative and outside workforce planning: nobody is counted or hired for it here."
        : "Outside workforce planning: its people aren't counted on staffing lines and it isn't hired for here. Switch \"In workforce planning\" on (Organization › Designations) to plan it." },
    };
  }
  steps.push({
    key: "desks", label: "Desks",
    state: desks.length ? "done" : "info",
    text: desks.length
      ? desks.map((d) => `${plural(Number(d.physical_seats) || 0, "desk")}${d.shared ? " (shared)" : ""}`).join(" + ")
      : lines.length ? "No desk group — its lines use a fixed number" : "No desk group",
  });
  steps.push({
    key: "lines", label: "Staffing lines",
    state: lines.length ? "done" : decided ? "info" : "blocked",
    text: lines.length ? `${plural(lines.length, "line")} · ${totals.required} required` : "No staffing line yet",
  });
  steps.push({
    key: "gap", label: "People",
    state: !lines.length ? "skip" : totals.stillToFind > 0 ? "todo" : "done",
    text: !lines.length ? "—"
      : `${totals.onRoll} on roll${totals.onTheWay ? ` · ${totals.onTheWay} on the way` : ""} · ${totals.stillToFind ? `${totals.stillToFind} still to find` : totals.short ? "gap covered" : "fully staffed"}`,
  });
  steps.push({
    key: "hiring", label: "Hiring requests",
    state: !lines.length || (totals.stillToFind === 0 && openRequests.length === 0) ? "skip"
      : pending.length || draftsReq.length || totals.notRequested > 0 ? "todo" : "done",
    text: !lines.length && openRequests.length === 0 ? "—"
      : openRequests.length === 0
      ? (totals.stillToFind > 0 ? `${totals.notRequested || totals.stillToFind} not requested yet` : "None needed")
      : [
          pending.length ? `${pending.length} awaiting approval` : null,
          draftsReq.length ? `${plural(draftsReq.length, "draft")} not sent` : null,
          openRequests.length - pending.length - draftsReq.length ? `${openRequests.length - pending.length - draftsReq.length} approved` : null,
          totals.notRequested ? `${totals.notRequested} not requested yet` : null,
        ].filter(Boolean).join(" · "),
  });
  steps.push({
    key: "recruit", label: "ATS job",
    state: !input.jobsByRequest ? "info" : noJob.length ? "todo" : jobs.length ? "done" : "skip",
    text: !input.jobsByRequest ? "Loading…"
      : noJob.length ? `${plural(noJob.length, "approved request")} with no ATS job`
      : jobs.length ? jobs.map((j) => `${j.job_code ?? "Job"}${j.status === "paused" ? " (paused)" : ""}`).join(", ")
      : !lines.length ? "—" : "No job needed yet",
  });

  // ── The one next step ──
  let next: StoryNext;
  if (st == null) next = { kind: "unknown", text: "Loading the planning decision…" };
  else if (st === "undecided") next = {
    kind: "decide",
    text: "Decide this designation first: plan its staffing lines, or mark it \"no staff needed now\". Until then nobody can raise a hiring request or open an ATS job for it.",
  };
  else if (st === "no_staff_needed") next = {
    kind: "plan",
    text: "Marked \"no staff needed now\", so hiring stays blocked. When it needs people, plan its staffing lines.",
  };
  else if (pending.length) next = {
    kind: "approve", requestId: pending[0].id,
    text: `Approve or reject ${pending[0].requirement_no ?? "the request"} (${plural(Number(pending[0].number_required) || 0, "person", "people")}). Recruitment starts once it is approved.`,
  };
  else if (!input.jobsByRequest && openRequests.some((q) => HIRING.has(q.status))) next = { kind: "unknown", text: "Checking which ATS jobs recruit for its requests…" };
  else if (noJob.length) next = {
    kind: "job", requestId: noJob[0].id,
    text: `${noJob[0].requirement_no ?? "A request"} is approved but no ATS job recruits for it${draftJobs.length ? " (a draft job doesn't count until it is opened)" : ""}. Link an open job or create one.`,
  };
  else if (draftsReq.length && totals.notRequested > 0) next = {
    kind: "draft", requestId: draftsReq[0].id,
    text: `${draftsReq[0].requirement_no ?? "A draft"} is still a draft — send it for approval; drafts don't count.`,
  };
  else if (heldLine) next = {
    kind: "raise", planId: heldLine.plan_id,
    text: `Hiring for ${plural(Number(heldLine.auto_paused_need) || heldLine.uncoveredHiringRequirement, "person", "people")} on ${heldLine.shiftLabel} is held back because a request was declined. Raise it again on the line if it is needed.`,
  };
  else if (uncoveredLine && uncoveredLine.uncoveredHiringRequirement > 0) next = {
    kind: "request", planId: uncoveredLine.plan_id,
    text: `${plural(uncoveredLine.uncoveredHiringRequirement, "person", "people")} on ${uncoveredLine.shiftLabel} with no hiring request yet. The system raises one on the next save or tonight at 01:15 IST, or request it now on the line.`,
  };
  else if (recruiting.length && totals.stillToFind > 0) {
    const j = jobs[0];
    next = { kind: "recruit", jobId: j?.id, text: `Recruiting: ${plural(totals.stillToFind, "person", "people")} still to find through ${jobs.map((x) => x.job_code ?? "the ATS job").join(", ")}.` };
  }
  else if (totals.onTheWay > 0 && totals.stillToFind === 0 && totals.short > 0) next = {
    kind: "join", text: `${plural(totals.onTheWay, "person", "people")} in training or joining will close the gap. Nothing to hire.`,
  };
  else if (!lines.length) next = { kind: "plan", text: "No staffing line covers this designation yet. Plan its lines." };
  else next = {
    kind: "staffed",
    text: totals.extra ? `Fully staffed, with ${totals.extra} extra on roll.` : "Fully staffed. Nothing to do.",
  };

  return { lines, desks, openRequests, closedRequests, jobs, draftJobs, totals, steps, next };
}
