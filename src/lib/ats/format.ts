const TZ = "Asia/Kolkata";

export function fmtDate(v?: string | null): string {
  if (!v) return "—";
  const d = new Date(v.length === 10 ? `${v}T00:00:00+05:30` : v);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { timeZone: TZ, day: "2-digit", month: "short", year: "numeric" });
}

export function fmtDateTime(v?: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  return `${d.toLocaleString("en-IN", {
    timeZone: TZ, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true,
  }).replace(/\b(am|pm)\b/gi, (x) => x.toUpperCase())} IST`;
}

export function fmtRelative(v?: string | null): string {
  if (!v) return "—";
  const diff = Date.now() - new Date(v).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  return fmtDate(v);
}

/** Today's date (YYYY-MM-DD) in IST. */
export function todayIST(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

export function fmtINR(n?: number | null): string {
  if (n == null) return "—";
  return `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export function fmtPay(min?: number | null, max?: number | null, period: string = "monthly"): string {
  if (min == null && max == null) return "—";
  const per = period === "annual" ? " / year" : " / month";
  if (min != null && max != null) return min === max ? `${fmtINR(min)}${per}` : `${fmtINR(min)}–${fmtINR(max).slice(1)}${per}`;
  if (min != null) return `From ${fmtINR(min)}${per}`;
  return `Up to ${fmtINR(max)}${per}`;
}

const yrs = (n: number) => String(Number(n));
export function fmtExperience(min?: number | null, max?: number | null): string {
  if (min == null && max == null) return "—";
  if (min != null && max != null) return min === max ? `${yrs(min)} yrs` : `${yrs(min)}–${yrs(max)} yrs`;
  if (min != null) return `${yrs(min)}+ yrs`;
  return `Up to ${yrs(max!)} yrs`;
}

export const EMPLOYMENT_TYPES = [
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "internship", label: "Internship" },
  { value: "trainee", label: "Trainee" },
] as const;
export const employmentLabel = (v?: string | null) => EMPLOYMENT_TYPES.find((t) => t.value === v)?.label ?? "—";

export const SOURCE_KINDS = [
  { value: "careers_page", label: "Careers page" },
  { value: "job_board", label: "Job board" },
  { value: "email", label: "Email" },
  { value: "referral", label: "Referral" },
  { value: "walk_in", label: "Walk-in" },
  { value: "agency", label: "Agency" },
  { value: "social", label: "Social" },
  { value: "import", label: "Import" },
  { value: "other", label: "Other" },
] as const;
export const sourceKindLabel = (v?: string | null) => SOURCE_KINDS.find((t) => t.value === v)?.label ?? "Other";

export const hhmm = (t?: string | null) => (t ? t.slice(0, 5) : "--:--");

export const humanize = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

const FIELD_LABELS: Record<string, string> = {
  title: "Title", department_id: "Department", position_id: "Designation", requisition_id: "Hiring requirement",
  shift_ids: "Shifts", employment_type: "Employment type", location: "Location", openings: "Openings",
  salary_min: "Salary", salary_max: "Salary", salary_period: "Salary period", show_salary: "Salary visibility",
  experience_min_years: "Experience", experience_max_years: "Experience", summary: "Summary",
  description: "Description", requirements: "Requirements", benefits: "Notes", aliases: "Alternative titles",
  hiring_manager_employee_id: "Hiring manager", target_close_date: "Target date", slug: "Link",
  owner_user_id: "Owner", owner_name: "Owner",
};
export function fieldLabels(fields: unknown): string {
  if (!Array.isArray(fields)) return "";
  const out = Array.from(new Set(fields.map((f) => FIELD_LABELS[String(f)] ?? humanize(String(f)))));
  return out.join(", ");
}
