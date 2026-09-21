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
}

export type StaffingStatus =
  | "understaffed"
  | "fully_staffed"
  | "overstaffed"
  | "hiring";

export interface StaffingDerived extends StaffingMatrixRow {
  /** Approved capacity still unused. */
  availableSeats: number;
  /** Required − current. Positive = short of people. */
  staffingGap: number;
  /** People still to hire once selected candidates and confirmed joiners land. */
  netHiringRequirement: number;
  /** Physical seats still free. */
  availablePhysicalSeats: number;
  seatUtilisationPct: number | null;
  status: StaffingStatus;
  /** Gap as a share of required headcount (used for the critical alert). */
  gapPct: number;
  alerts: string[];
}

export function deriveStaffingRow(row: StaffingMatrixRow): StaffingDerived {
  const availableSeats = row.approved_hc - row.current_hc;
  const staffingGap = row.required_hc - row.current_hc;
  const netHiringRequirement = Math.max(
    0,
    row.required_hc - row.current_hc - row.selected_hc - row.pending_joining_hc,
  );
  const availablePhysicalSeats = row.physical_seats
    ? row.physical_seats - row.current_hc
    : 0;
  const seatUtilisationPct = row.physical_seats
    ? (row.current_hc / row.physical_seats) * 100
    : null;

  let status: StaffingStatus;
  if (staffingGap > 0) {
    status = row.open_requirement_count > 0 ? "hiring" : "understaffed";
  } else if (staffingGap === 0) {
    status = "fully_staffed";
  } else {
    status = "overstaffed";
  }

  const gapPct = row.required_hc > 0 ? (staffingGap / row.required_hc) * 100 : 0;

  const alerts: string[] = [];
  if (gapPct >= 20) alerts.push("Critical staffing gap");
  if (staffingGap < 0) alerts.push("Overstaffed");
  if (row.physical_seats > 0 && row.current_hc >= row.physical_seats)
    alerts.push("Seat capacity reached");
  if (row.target_date && netHiringRequirement > 0) {
    const days =
      (new Date(row.target_date).getTime() - Date.now()) / 86_400_000;
    if (days <= 15) alerts.push("Hiring deadline approaching");
  }
  if (row.notice_period_hc > 0)
    alerts.push(`${row.notice_period_hc} on notice period`);

  return {
    ...row,
    availableSeats,
    staffingGap,
    netHiringRequirement,
    availablePhysicalSeats,
    seatUtilisationPct,
    status,
    gapPct,
    alerts,
  };
}

export const STATUS_LABEL: Record<StaffingStatus, string> = {
  understaffed: "Understaffed",
  fully_staffed: "Adequately staffed",
  overstaffed: "Overstaffed",
  hiring: "Hiring",
};

export const STATUS_CLASS: Record<StaffingStatus, string> = {
  understaffed: "bg-destructive/15 text-destructive border-destructive/30",
  fully_staffed: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  overstaffed: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  hiring: "bg-primary/15 text-primary border-primary/30",
};

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

export const EMPLOYMENT_TYPES = [
  "Full Time",
  "Part Time",
  "Contract",
  "Intern",
  "Consultant",
];

export const SHIFT_LABELS = ["Morning", "Evening", "Night", "General"];

/** Filters shared by every workforce planning page. */
export interface WorkforceFilterState {
  departmentId: string;
  positionId: string;
  shift: string;
  location: string;
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
  location: "all",
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
  if (f.shift !== "all" && (row.shift_name || "—") !== f.shift) return false;
  if (f.location !== "all" && (row.location || "—") !== f.location) return false;
  if (
    f.employmentType !== "all" &&
    (row.employment_type || "—") !== f.employmentType
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
