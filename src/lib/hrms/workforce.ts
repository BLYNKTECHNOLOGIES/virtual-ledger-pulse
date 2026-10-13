/**
 * Workforce planning calculations.
 *
 * Single place where every staffing number is derived, so the pages never
 * invent their own arithmetic. Headcount, physical seats and recruitment
 * pipeline are deliberately kept as separate concepts.
 */

export interface StaffingMatrixRow {
  plan_id: string;
  department_id: string | null;
  department_name: string | null;
  position_id: string | null;
  position_title: string | null;
  shift_id: string | null;
  shift_name: string | null;
  location: string | null;
  employment_type: string | null;
  approved_hc: number;
  required_hc: number;
  current_hc: number;
  physical_seats: number;
  pipeline_hc: number;
  selected_hc: number;
  pending_joining_hc: number;
  notice_period_hc: number;
  target_date: string | null;
  priority: string;
  open_requirement_count: number;
  open_requirement_hc: number;
  shift_group_name: string | null;
  seat_capacity_id: string | null;
  follow_desks: boolean;
  in_training_hc: number;
  training_ready_date: string | null;
  over_requested_hc: number;
  /** Desks the database uses for this line (operational capacity; 0 when the desk group is inactive). */
  operational_capacity?: number | null;
  seat_active?: boolean | null;
  /** Set when a person declined this line's automatic request. */
  auto_paused_at?: string | null;
  auto_paused_by_name?: string | null;
  auto_paused_reason?: string | null;
  auto_paused_need?: number | null;
  /** Open replacements for people on this line still serving notice (capped by them) — they cover future exits only. */
  replacement_cover_hc?: number | null;
}

/** "Automatic hiring paused — declined by <name> on <date>: <reason>" (null when not paused). */
export function pauseText(r: Pick<StaffingMatrixRow, "auto_paused_at" | "auto_paused_by_name" | "auto_paused_reason"> & { auto_paused_need?: number | null }): string | null {
  if (!r.auto_paused_at) return null;
  const need = Number(r.auto_paused_need) || 0;
  return `Automatic hiring paused${need ? ` for ${need}` : ""} — declined or lowered by ${r.auto_paused_by_name || "a manager"} on ${formatIstDate(r.auto_paused_at)}${r.auto_paused_reason ? `: ${r.auto_paused_reason}` : ""}. Growth beyond this is still requested.`;
}

/** A desk group belongs to a shift only when its line there requires more than 0. */
export function seatCountsInShift(line: Pick<StaffingMatrixRow, "required_hc">): boolean {
  return (Number(line.required_hc) || 0) > 0;
}

export type StaffingStatus =
  | "understaffed"
  | "fully_staffed"
  | "overstaffed";

export interface StaffingDerived extends StaffingMatrixRow {
  /** Approved − on roll (can be negative). */
  availableSeats: number;
  /** Required − on roll. Positive = short of people. */
  staffingGap: number;
  /** max(0, required − on roll − selected − joining − in training). */
  netHiringRequirement: number;
  /** max(0, net need − open requirement people). */
  uncoveredHiringRequirement: number;
  status: StaffingStatus;
  /** Gap as a share of required headcount (used for the critical alert). */
  gapPct: number;
  /** Planning shift label ("Any shift" when the line has none). */
  shiftLabel: string;
  alerts: string[];
}

const n = (v: unknown) => Number(v) || 0;

export function deriveStaffingRow(raw: StaffingMatrixRow): StaffingDerived {
  const row: StaffingMatrixRow = {
    ...raw,
    approved_hc: n(raw.approved_hc),
    required_hc: n(raw.required_hc),
    current_hc: n(raw.current_hc),
    physical_seats: n(raw.physical_seats),
    pipeline_hc: n(raw.pipeline_hc),
    selected_hc: n(raw.selected_hc),
    pending_joining_hc: n(raw.pending_joining_hc),
    notice_period_hc: n(raw.notice_period_hc),
    open_requirement_count: n(raw.open_requirement_count),
    open_requirement_hc: n(raw.open_requirement_hc),
    in_training_hc: n(raw.in_training_hc),
    over_requested_hc: n(raw.over_requested_hc),
    follow_desks: !!raw.follow_desks,
  };
  const availableSeats = row.approved_hc - row.current_hc;
  const staffingGap = row.required_hc - row.current_hc;
  const netHiringRequirement = Math.max(
    0,
    row.required_hc - row.current_hc - row.selected_hc - row.pending_joining_hc - row.in_training_hc,
  );
  // Replacements for people still on notice cover only those future exits, not today's empty desks.
  const coveringToday = Math.max(0, row.open_requirement_hc - n(raw.replacement_cover_hc));
  const uncoveredHiringRequirement = Math.max(0, netHiringRequirement - coveringToday);

  // A requisition does not make a vacant seat staffed: status follows the gap only.
  const status: StaffingStatus =
    staffingGap > 0 ? "understaffed" : staffingGap === 0 ? "fully_staffed" : "overstaffed";

  const gapPct = row.required_hc > 0 ? (staffingGap / row.required_hc) * 100 : 0;
  const shiftLabel = row.shift_group_name || row.shift_name || "Any shift";

  const alerts: string[] = [];
  if (staffingGap > 0 && gapPct >= 20) alerts.push("Critical staffing gap");
  if (staffingGap < 0) alerts.push("Overstaffed");
  if (row.physical_seats > 0 && row.current_hc > row.physical_seats)
    alerts.push("People without a desk");
  const desks = raw.operational_capacity == null ? null : n(raw.operational_capacity);
  if (row.follow_desks && desks != null && desks > 0 && row.current_hc === desks) alerts.push("Seat capacity reached");
  if (row.over_requested_hc > 0) alerts.push(`Over-requested by ${row.over_requested_hc}`);
  if (row.target_date && netHiringRequirement > 0 && daysUntil(row.target_date) <= 15)
    alerts.push("Hiring deadline approaching");
  if (row.notice_period_hc > 0) alerts.push(`${row.notice_period_hc} on notice period`);

  return {
    ...row,
    availableSeats,
    staffingGap,
    netHiringRequirement,
    uncoveredHiringRequirement,
    status,
    gapPct,
    shiftLabel,
    alerts,
  };
}

/** Whole days from today (IST) to an ISO date. */
export function daysUntil(isoDate: string, today: string = istToday()): number {
  return Math.round((Date.parse(isoDate.slice(0, 10)) - Date.parse(today)) / 86_400_000);
}

export interface StaffingTotals {
  lines: number;
  required: number;
  approved: number;
  current: number;
  inTraining: number;
  /** Σ positive gaps — a surplus in one line never nets against a shortage in another. */
  shortNow: number;
  overNow: number;
  netNeed: number;
  uncovered: number;
  requested: number;
  overRequested: number;
  pipeline: number;
  selected: number;
  joining: number;
  notice: number;
  /** Σ max(0, approved − on roll) per line. */
  vacant: number;
  nextReadyDate: string | null;
}

/** Totals are sums of per-line values, never "total required − total on roll". */
export function sumLines(rows: StaffingDerived[]): StaffingTotals {
  const t: StaffingTotals = {
    lines: rows.length, required: 0, approved: 0, current: 0, inTraining: 0, shortNow: 0,
    overNow: 0, netNeed: 0, uncovered: 0, requested: 0, overRequested: 0, pipeline: 0,
    selected: 0, joining: 0, notice: 0, vacant: 0, nextReadyDate: null,
  };
  for (const r of rows) {
    t.required += r.required_hc;
    t.approved += r.approved_hc;
    t.current += r.current_hc;
    t.inTraining += r.in_training_hc;
    t.shortNow += Math.max(0, r.staffingGap);
    t.overNow += Math.max(0, -r.staffingGap);
    t.netNeed += r.netHiringRequirement;
    t.uncovered += r.uncoveredHiringRequirement;
    t.requested += r.open_requirement_hc;
    t.overRequested += r.over_requested_hc;
    t.pipeline += r.pipeline_hc;
    t.selected += r.selected_hc;
    t.joining += r.pending_joining_hc;
    t.notice += r.notice_period_hc;
    t.vacant += Math.max(0, r.availableSeats);
    if (r.training_ready_date && (!t.nextReadyDate || r.training_ready_date < t.nextReadyDate))
      t.nextReadyDate = r.training_ready_date;
  }
  return t;
}

export interface RebalanceHint {
  key: string;
  role: string;
  department: string | null;
  over: { shift: string; by: number }[];
  short: { shift: string; by: number }[];
  movable: number;
  message: string;
}

/** Same role over in one shift and short in another: moving people beats hiring. */
export function findRebalances(rows: StaffingDerived[]): RebalanceHint[] {
  const groups = new Map<string, StaffingDerived[]>();
  for (const r of rows) {
    const key = `${r.department_id ?? "-"}|${r.position_id ?? "-"}`;
    groups.set(key, [...(groups.get(key) || []), r]);
  }
  const out: RebalanceHint[] = [];
  groups.forEach((list, key) => {
    const over = list.filter((r) => r.staffingGap < 0).map((r) => ({ shift: r.shiftLabel, by: -r.staffingGap }));
    const short = list.filter((r) => r.staffingGap > 0).map((r) => ({ shift: r.shiftLabel, by: r.staffingGap }));
    if (!over.length || !short.length) return;
    const overTotal = over.reduce((a, o) => a + o.by, 0);
    const shortTotal = short.reduce((a, s) => a + s.by, 0);
    const movable = Math.min(overTotal, shortTotal);
    const role = list[0].position_title || "Role";
    const overText = over.map((o) => `${o.shift} has ${o.by} more than required`).join(", ");
    const shortText = short.map((s) => `${s.shift} is short ${s.by}`).join(", ");
    const biggest = short.slice().sort((a, b) => b.by - a.by)[0];
    const moveHere = Math.min(movable, biggest.by);
    out.push({
      key, role, department: list[0].department_name, over, short, movable,
      message: `${role}: ${overText}; ${shortText} — moving ${moveHere} ${moveHere === 1 ? "person" : "people"} cuts ${biggest.shift} hiring to ${biggest.by - moveHere}.`,
    });
  });
  return out;
}

export interface PlanningShiftLike {
  id: string;
  name: string;
  start_time?: string | null;
  planning_shift_id?: string | null;
  is_training_shift?: boolean | null;
}

/** Operating order: by start time, with shifts starting before 06:00 placed last. */
export function operatingOrderKey(start?: string | null): number {
  if (!start) return 99 * 60;
  const [h = "0", m = "0"] = start.split(":");
  const mins = Number(h) * 60 + Number(m);
  return mins < 6 * 60 ? mins + 24 * 60 : mins;
}

export function sortByOperatingOrder<T extends { start_time?: string | null; name: string }>(list: T[]): T[] {
  return list
    .slice()
    .sort((a, b) => operatingOrderKey(a.start_time) - operatingOrderKey(b.start_time) || a.name.localeCompare(b.name));
}

/** Shifts that count as themselves and are not training shifts, in operating order. */
export function planningShifts<T extends PlanningShiftLike>(shifts: T[]): T[] {
  return sortByOperatingOrder(shifts.filter((s) => !s.planning_shift_id && !s.is_training_shift));
}

/** The planning shift a raw shift counts as (itself when it has no group). */
export function planningShiftId(shifts: PlanningShiftLike[], shiftId?: string | null): string | null {
  if (!shiftId) return null;
  const s = shifts.find((x) => x.id === shiftId);
  return s?.planning_shift_id || shiftId;
}

/**
 * Job shifts a requirement's line does not cover (compared as planning shifts, so Morning Exemption = Morning).
 * lineShiftIds empty = the line covers any shift.
 */
export function shiftsOutsideLine(shifts: PlanningShiftLike[], jobShiftIds: string[], lineShiftIds: string[]): PlanningShiftLike[] {
  if (!lineShiftIds.length) return [];
  const covered = new Set(lineShiftIds.map((id) => planningShiftId(shifts, id)));
  return jobShiftIds
    .filter((id) => !covered.has(planningShiftId(shifts, id)))
    .map((id) => shifts.find((s) => s.id === id))
    .filter((s): s is PlanningShiftLike => !!s);
}

export type GapTone = "short" | "met" | "over";
export function gapTone(gap: number): GapTone {
  return gap > 0 ? "short" : gap < 0 ? "over" : "met";
}
export const GAP_CHIP_CLASS: Record<GapTone, string> = {
  short: "bg-destructive/15 text-destructive border-destructive/30",
  met: "bg-success/15 text-success border-success/30",
  over: "bg-warning/15 text-warning border-warning/30",
};
export function gapLabel(gap: number): string {
  return gap > 0 ? `short ${gap}` : gap < 0 ? `over ${-gap}` : "met";
}

/** Status filter options. */
export const STATUS_FILTER_OPTIONS: { value: StaffingStatus; label: string }[] = [
  { value: "understaffed", label: "Short" },
  { value: "fully_staffed", label: "Met" },
  { value: "overstaffed", label: "Over" },
];

export const PRIORITIES = ["critical", "high", "medium", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABEL: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const PRIORITY_CLASS: Record<string, string> = {
  critical: "bg-destructive/15 text-destructive border-destructive/30",
  high: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  medium: "bg-primary/15 text-primary border-primary/30",
  low: "bg-muted text-muted-foreground border-border",
};

export const REQUIREMENT_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "recruitment_active",
  "partially_fulfilled",
  "fulfilled",
  "cancelled",
  "rejected",
] as const;
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];

export const REQ_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  approved: "Approved",
  recruitment_active: "Recruitment active",
  partially_fulfilled: "Partially fulfilled",
  fulfilled: "Fulfilled",
  cancelled: "Cancelled",
  rejected: "Rejected",
};

export const REQ_STATUS_CLASS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  pending_approval: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  approved: "bg-primary/15 text-primary border-primary/30",
  recruitment_active: "bg-sky-500/15 text-sky-600 border-sky-500/30",
  partially_fulfilled: "bg-sky-500/15 text-sky-600 border-sky-500/30",
  fulfilled: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  cancelled: "bg-muted text-muted-foreground border-border",
  rejected: "bg-destructive/15 text-destructive border-destructive/30",
};

export const HIRING_REASONS = [
  { value: "new_business", label: "New business" },
  { value: "expansion", label: "Expansion" },
  { value: "replacement", label: "Replacement" },
  { value: "attrition", label: "Attrition" },
  { value: "shift_expansion", label: "Shift expansion" },
  { value: "increased_workload", label: "Increased workload" },
  { value: "skill_requirement", label: "Skill requirement" },
  { value: "other", label: "Other" },
];

/** ATS employment-type codes, which plans and requirements store. */
export const EMPLOYMENT_TYPE_OPTIONS = [
  { value: "full_time", label: "Full time" },
  { value: "part_time", label: "Part time" },
  { value: "contract", label: "Contract" },
  { value: "internship", label: "Internship" },
  { value: "trainee", label: "Trainee" },
] as const;

export function employmentTypeLabel(v?: string | null): string {
  if (!v) return "—";
  return EMPLOYMENT_TYPE_OPTIONS.find((o) => o.value === normEmploymentType(v))?.label ?? v;
}

/** Plans and requirements store ATS codes (full_time…); labels like "Full Time" map to the same code. */
export function normEmploymentType(v?: string | null): string {
  if (!v) return "—";
  const c = v.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (c === "intern") return "internship";
  if (c === "consultant") return "contract";
  return c;
}

/** Filters shared by every workforce planning page. */
export interface WorkforceFilterState {
  departmentId: string;
  positionId: string;
  shift: string;
  employmentType: string;
  status: string;
  priority: string;
  fromDate: string;
  toDate: string;
}

export const EMPTY_FILTERS: WorkforceFilterState = {
  departmentId: "all",
  positionId: "all",
  shift: "all",
  employmentType: "all",
  status: "all",
  priority: "all",
  fromDate: "",
  toDate: "",
};

export function matchesFilters(
  row: StaffingDerived,
  f: WorkforceFilterState,
): boolean {
  if (f.departmentId !== "all" && row.department_id !== f.departmentId) return false;
  if (f.positionId !== "all" && row.position_id !== f.positionId) return false;
  if (f.shift !== "all" && row.shiftLabel !== f.shift) return false;
  if (
    f.employmentType !== "all" &&
    normEmploymentType(row.employment_type) !== normEmploymentType(f.employmentType)
  )
    return false;
  if (f.status !== "all" && row.status !== f.status) return false;
  if (f.priority !== "all" && row.priority !== f.priority) return false;
  if (f.fromDate && (!row.target_date || row.target_date < f.fromDate)) return false;
  if (f.toDate && (!row.target_date || row.target_date > f.toDate)) return false;
  return true;
}

/** IST date helpers — all planning dates are read and written in IST. */
export function istToday(): string {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

export function formatIstDate(value?: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

export function formatIstDateTime(value?: string | null): string {
  if (!value) return "—";
  return `${new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  })} IST`;
}

/** The IST calendar day after `today` (YYYY-MM-DD). */
export function istNextDay(today: string = istToday()): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Training is over once its completion date is before today (IST). */
export function trainingEnded(readyDate?: string | null, today: string = istToday()): boolean {
  return !!readyDate && readyDate < today;
}

/** Joiners overdue per line ("1 joining, overdue"); keyed by plan id. */
export function overdueByLine(rows: { plan_id: string | null }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) if (r.plan_id) m.set(r.plan_id, (m.get(r.plan_id) ?? 0) + 1);
  return m;
}
