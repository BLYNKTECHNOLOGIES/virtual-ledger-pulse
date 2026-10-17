/**
 * The planning chain: the six steps every Organization and Workforce Planning screen belongs to,
 * what each step hands to the next, the words used for every number and the rules the system applies.
 *
 * One source for the chain map (Overview), the chain band (top of every page) and "How it works".
 * Numbers are only added up here from the staffing matrix (per-line values from the database and
 * deriveStaffingRow); nothing is recalculated.
 */
import type { StaffingDerived } from "./workforce";

export type ChainStepKey = "designations" | "desks" | "lines" | "hiring" | "recruit" | "forecast";

export interface ChainStep {
  key: ChainStepKey;
  n: number;
  label: string;
  /** Where the step is changed. */
  where: string;
  to: string;
  /** What the step holds, in one sentence. */
  what: string;
  /** What it hands to the next step. */
  feeds: string;
}

export const CHAIN_STEPS: readonly ChainStep[] = [
  {
    key: "designations", n: 1, label: "Designations", where: "Organization", to: "/hrms/organization?tab=designations",
    what: "The jobs in each department. Every designation in workforce planning needs a decision: plan its lines, no staff needed now, or outside planning.",
    feeds: "Planned designations get staffing lines.",
  },
  {
    key: "desks", n: 2, label: "Desks", where: "Workforce planning", to: "/hrms/workforce-planning/capacity-seats",
    what: "Desks per designation. Shifts share desks, so a line that follows its desks needs every desk filled in each shift it works.",
    feeds: "Desks set what each line requires.",
  },
  {
    key: "lines", n: 3, label: "Staffing plan", where: "Workforce planning", to: "/hrms/workforce-planning/staffing-plan",
    what: "One line per designation and shift: how many people it requires, against who is on roll today.",
    feeds: "Each line's gap goes to hiring by itself.",
  },
  {
    key: "hiring", n: 4, label: "Hiring requests", where: "Workforce planning", to: "/hrms/workforce-planning/hiring-requirements",
    what: "Each line's gap becomes one automatic hiring request that waits for HR's approval.",
    feeds: "Approved requests get an ATS job.",
  },
  {
    key: "recruit", n: 5, label: "Recruit & onboard", where: "Recruitment (ATS) and Onboarding", to: "/hrms/ats/jobs",
    what: "Candidates apply to the ATS job. A hire goes to onboarding against the request.",
    feeds: "Joiners count on roll on their line, and the request fills.",
  },
  {
    key: "forecast", n: 6, label: "Forecast", where: "Workforce planning", to: "/hrms/workforce-planning/forecast",
    what: "The same lines month by month: trainees and joiners in, people leaving out.",
    feeds: "Shows where you will be short next.",
  },
];

export const chainStep = (key: ChainStepKey): ChainStep => CHAIN_STEPS.find((s) => s.key === key)!;

/** The words used for every Workforce number, defined once (shown in "How it works" and next to figures). */
export const WF_WORDS = {
  required: { term: "Required", text: "How many people a line needs. A line that follows its desks requires one person per desk." },
  onRoll: { term: "On roll", text: "People counted on a line today: their designation, department and today's shift match the line. People in training are not on roll yet." },
  short: { term: "Short", text: "Required minus on roll, line by line. An extra person on one line never fills a gap on another." },
  extra: { term: "Extra", text: "People on roll above what their line requires." },
  training: { term: "In training", text: "New people on the training shift, counted for the line they will join." },
  joining: { term: "Joining", text: "People hired for a line who have not joined yet (with or without a joining date)." },
  onTheWay: { term: "On the way", text: "People in training and joining, counted up to each line's shortfall." },
  stillToFind: { term: "Still to find", text: "Short minus the people on the way: who hiring still has to find." },
  inHiring: { term: "In hiring", text: "Still to find that open hiring requests already cover." },
  notRequested: { term: "Not requested yet", text: "Still to find that no open hiring request covers — usually because HR held part of an automatic request back." },
  heldBack: { term: "Held back", text: "The part of an automatic request HR declined or lowered. It stays held back until the line changes or someone clicks Raise again." },
} as const;

/** Rules the system applies by itself, in plain words (the "hidden" rules). */
export const WF_RULES: readonly { title: string; text: string }[] = [
  { title: "Hiring requests are raised for you", text: "Whenever a line, a desk group or the people on it change, the system raises, resizes or cancels that line's automatic request — straight after the save and again every night at 01:15 IST. Each line has at most one automatic request, and it waits for approval." },
  { title: "Desks count once per shift", text: "Desks are shared by the shifts. A desk group of 2 desks worked in Morning, Evening and Night needs 6 people: 2 on each line." },
  { title: "Declining holds hiring back", text: "Rejecting, cancelling or lowering an automatic request awaiting approval holds that number back on the line. Growth beyond it is still requested. Raise again (on the line) lifts it." },
  { title: "Drafts don't count", text: "A draft request covers nothing until it is sent for approval." },
  { title: "A designation must be decided before hiring", text: "\"Not decided\" and \"No staff needed now\" both block hiring requests and ATS jobs for the designation until it gets a staffing line." },
  { title: "Leaving planning stops counting", text: "Taking a designation out of workforce planning closes its own lines and stops counting its people. Bringing it back does not restore the lines." },
  { title: "Priority is worked out per line", text: "From the gap and the target joining date (Critical within 7 days or when nobody is on the line yet). HR can pin it." },
  { title: "Jobs follow their requests", text: "An ATS job's openings are what its requests still need, and the job closes when every request on it is filled." },
  { title: "Joining puts people on roll", text: "Finishing onboarding puts the person on roll straight away. A trainee moves to the working shift only when HR moves them." },
];

export interface GapParts {
  required: number;
  onRoll: number;
  /** Σ min(on roll, required): people on roll who fill a required place. */
  filling: number;
  extra: number;
  short: number;
  /** Counted against the shortfall (short − still to find). */
  onTheWay: number;
  training: number;
  joining: number;
  /** In training or joining for lines that are already full (not counted). */
  onTheWayExtra: number;
  stillToFind: number;
  inHiring: number;
  notRequested: number;
  overRequested: number;
  heldBack: number;
  lines: number;
}

/**
 * The gap, step by step — every part adds up exactly:
 * required − filling = short; short − on the way = still to find; still to find = in hiring + not requested yet.
 */
export function gapParts(rows: StaffingDerived[]): GapParts {
  const p: GapParts = {
    required: 0, onRoll: 0, filling: 0, extra: 0, short: 0, onTheWay: 0, training: 0, joining: 0, onTheWayExtra: 0,
    stillToFind: 0, inHiring: 0, notRequested: 0, overRequested: 0, heldBack: 0, lines: rows.length,
  };
  for (const r of rows) {
    const req = r.required_hc;
    const cur = r.current_hc;
    p.required += req;
    p.onRoll += cur;
    p.filling += Math.min(cur, req);
    p.extra += Math.max(0, cur - req);
    const short = Math.max(0, req - cur);
    p.short += short;
    const join = r.selected_hc + r.pending_joining_hc;
    const train = r.in_training_hc;
    const t = Math.min(short, train);
    const j = Math.min(short - t, join);
    p.training += t;
    p.joining += j;
    p.onTheWayExtra += train + join - t - j;
    p.stillToFind += r.netHiringRequirement;
    p.notRequested += r.uncoveredHiringRequirement;
    p.overRequested += r.over_requested_hc;
    if (r.auto_paused_at) p.heldBack += Number(r.auto_paused_need) || 0;
  }
  p.onTheWay = p.short - p.stillToFind;
  p.inHiring = p.stillToFind - p.notRequested;
  return p;
}

export type PlanningStatusLike = "planned" | "no_staff_needed" | "undecided" | "outside";
export type FlagTone = "danger" | "warning" | "ok";

export interface ChainFigure {
  key: ChainStepKey;
  /** null while loading. */
  value: string | null;
  unit: string;
  detail: string;
  flag: { text: string; tone: FlagTone } | null;
  /** What this step hands to the next one, with today's number. */
  handoff: string;
}

export interface ChainFigureInput {
  /** Designations in scope (outside planning included) with their planning status; null while loading. */
  designations: { id: string; status: PlanningStatusLike | null }[] | null;
  /** Active desk groups in scope; null while loading. */
  seats: { physical_seats?: number | null; is_training_only?: boolean | null }[] | null;
  lines: StaffingDerived[];
  /** Open requests in scope (awaiting approval, approved, recruiting, partly filled); null while loading. */
  openRequests: { status: string }[] | null;
  /** Approved or recruiting requests with no open ATS job; null when unknown. */
  noJob: number | null;
  /** Open or paused ATS jobs linked to the open requests; null when unknown. */
  liveJobs: { openings?: number | null }[] | null;
  forecast: { closing: number; required: number; lineGap: number; endLabel: string } | null;
  /** People on notice in scope; null when unknown. */
  leaving?: number | null;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Today's figure for each step of the chain, in CHAIN_STEPS order. */
export function chainFigures(input: ChainFigureInput): ChainFigure[] {
  const g = gapParts(input.lines);
  const following = input.lines.filter((r) => r.follow_desks).length;

  const des = input.designations;
  const count = (s: PlanningStatusLike) => (des ?? []).filter((d) => d.status === s).length;
  const planned = count("planned");
  const undecided = count("undecided");
  const noStaff = count("no_staff_needed");
  const inPlanning = planned + undecided + noStaff;

  const work = (input.seats ?? []).filter((s) => !s.is_training_only);
  const desks = work.reduce((a, s) => a + (Number(s.physical_seats) || 0), 0);
  const trainingSeats = (input.seats ?? []).filter((s) => s.is_training_only).reduce((a, s) => a + (Number(s.physical_seats) || 0), 0);

  const open = input.openRequests;
  const pending = (open ?? []).filter((r) => r.status === "pending_approval").length;
  const jobs = input.liveJobs;
  const openings = (jobs ?? []).reduce((a, j) => a + (Number(j.openings) || 0), 0);

  return [
    {
      key: "designations",
      value: des ? String(inPlanning) : null,
      unit: "in workforce planning",
      detail: des ? [`${planned} planned`, undecided ? `${undecided} not decided` : null, noStaff ? `${noStaff} no staff needed` : null].filter(Boolean).join(" · ") : "",
      flag: !des ? null : undecided ? { text: `${undecided} to decide`, tone: "warning" } : { text: "All decided", tone: "ok" },
      handoff: des ? `${planned} with staffing lines` : "",
    },
    {
      key: "desks",
      value: input.seats ? String(desks) : null,
      unit: desks === 1 ? "desk" : "desks",
      detail: input.seats ? `${plural(work.length, "desk group")}${trainingSeats ? ` · +${trainingSeats} training seats` : ""}` : "",
      flag: null,
      handoff: `${plural(following, "line")} ${following === 1 ? "follows its" : "follow their"} desks`,
    },
    {
      key: "lines",
      value: `${g.onRoll} / ${g.required}`,
      unit: "on roll / required",
      detail: `${plural(g.lines, "line")}${g.required ? ` · ${Math.round((g.filling / g.required) * 100)}% staffed` : ""}${g.extra ? ` · ${g.extra} extra` : ""}`,
      flag: g.short > 0 ? { text: `${g.short} short`, tone: "danger" } : { text: "Fully staffed", tone: "ok" },
      handoff: `${g.stillToFind} still to find go to hiring`,
    },
    {
      key: "hiring",
      value: open ? String(g.inHiring) : null,
      unit: "people in hiring",
      detail: open ? `${plural(open.length, "open request")}${g.notRequested ? ` · ${g.notRequested} not requested yet` : ""}` : "",
      flag: !open ? null : pending ? { text: `${pending} to approve`, tone: "warning" } : g.notRequested ? { text: `${g.notRequested} not requested`, tone: "warning" } : { text: "All requested", tone: "ok" },
      handoff: input.noJob ? `${input.noJob} approved, waiting for an ATS job` : "Approved ones get an ATS job",
    },
    {
      key: "recruit",
      value: jobs ? String(jobs.length) : null,
      unit: jobs && jobs.length === 1 ? "ATS job open" : "ATS jobs open",
      detail: jobs ? [`${plural(openings, "opening")}`, g.joining || g.training ? `${g.joining + g.training} on the way` : null].filter(Boolean).join(" · ") : "",
      flag: input.noJob ? { text: `${input.noJob} without a job`, tone: "danger" } : null,
      handoff: "Joiners count on roll",
    },
    {
      key: "forecast",
      value: input.forecast ? `${input.forecast.closing} / ${input.forecast.required}` : null,
      unit: input.forecast ? `by ${input.forecast.endLabel}` : "in 90 days",
      detail: input.forecast
        ? [input.forecast.lineGap > 0 ? `${input.forecast.lineGap} short then` : "no line short then", input.leaving ? `${input.leaving} leaving` : null].filter(Boolean).join(" · ")
        : "",
      flag: !input.forecast ? null : input.forecast.lineGap > 0 ? { text: `${input.forecast.lineGap} short in 90 days`, tone: "warning" } : { text: "On track", tone: "ok" },
      handoff: "",
    },
  ];
}

/** The stages every hiring request moves through (statuses change only via hr_requirement_transition). */
export const REQUEST_STAGES = ["Awaiting approval", "Approved", "Recruiting", "Filled"] as const;

/** Where a request is: stage index 0–3, or a side state (draft before stage 0; rejected / cancelled off the path). */
export function requestStage(status: string): { index: number; side: "draft" | "rejected" | "cancelled" | null } {
  switch (status) {
    case "draft": return { index: -1, side: "draft" };
    case "pending_approval": return { index: 0, side: null };
    case "approved": return { index: 1, side: null };
    case "recruitment_active": case "partially_fulfilled": return { index: 2, side: null };
    case "fulfilled": return { index: 3, side: null };
    case "rejected": return { index: -1, side: "rejected" };
    case "cancelled": return { index: -1, side: "cancelled" };
    default: return { index: -1, side: null };
  }
}

interface WhyRequest {
  source?: string | null;
  status?: string | null;
  requested_by_name?: string | null;
  adds_headcount?: number | null;
  replacement?: { first_name?: string | null; last_name?: string | null } | null;
}
type WhyLine = Pick<StaffingDerived, "shiftLabel" | "required_hc" | "current_hc" | "staffingGap" | "netHiringRequirement">;

const personName = (p?: { first_name?: string | null; last_name?: string | null } | null) =>
  [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim();

/** Why a hiring request exists, in one sentence (the automatic engine's reason is shown with the line's live numbers). */
export function requestWhy(r: WhyRequest, line?: WhyLine | null): string {
  switch (r.source) {
    case "capacity_occupancy": {
      if (!line) return "Raised automatically from a staffing line's gap.";
      const way = Math.max(0, line.staffingGap) - line.netHiringRequirement;
      const resize = r.status === "pending_approval" ? " It resizes by itself while it waits for approval." : "";
      return `Raised automatically for the ${line.shiftLabel} line: it requires ${line.required_hc}, ${line.current_hc} on roll${way ? `, ${way} on the way` : ""} — ${line.netHiringRequirement} still to find.${resize}`;
    }
    case "department_request":
      return (Number(r.adds_headcount) || 0) > 0
        ? `Asked for by ${r.requested_by_name || "the department head"} to add ${r.adds_headcount} beyond the line's required number. Approving raises the line.`
        : `Asked for by ${r.requested_by_name || "the department head"} to fill the line's gap.`;
    case "employee_separation":
      return `Replaces ${personName(r.replacement) || "someone who is leaving"}: it covers their desk once they leave.`;
    default:
      return `Raised by hand${r.requested_by_name ? ` by ${r.requested_by_name}` : ""}.`;
  }
}

/** The same reason in a few words, for lists. */
export function requestWhyShort(r: WhyRequest, line?: WhyLine | null): string {
  switch (r.source) {
    case "capacity_occupancy": return line ? `line: ${line.current_hc} of ${line.required_hc} on roll` : "automatic";
    case "department_request": return (Number(r.adds_headcount) || 0) > 0 ? `adds +${r.adds_headcount}` : `asked by ${r.requested_by_name || "the department head"}`;
    case "employee_separation": return `replaces ${personName(r.replacement) || "a leaver"}`;
    default: return "raised by hand";
  }
}

/** Which chain step each "Needs attention" topic belongs to (group keys from useWorkforceAttention). */
export const ATTENTION_STEP: Record<string, ChainStepKey> = {
  "unplanned-roles": "designations",
  "no-desk": "desks",
  "desks-no-line": "desks",
  "full-desks": "desks",
  "rebalance": "lines",
  "unplanned-people": "lines",
  "approvals": "hiring",
  "needs-line": "hiring",
  "over-requested": "hiring",
  "paused": "hiring",
  "deadline": "hiring",
  "no-job": "recruit",
  "overdue": "recruit",
  "trained": "recruit",
  "trainee-shift": "recruit",
  "leaving": "forecast",
};
