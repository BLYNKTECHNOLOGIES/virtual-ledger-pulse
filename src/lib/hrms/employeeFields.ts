// Shared employee field helpers: work type values, monthly CTC on record, full name.

export const WORK_TYPES = [
  { value: "On-site", label: "On-site" },
  { value: "Remote", label: "Remote" },
  { value: "Hybrid", label: "Hybrid" },
] as const;

/** Maps legacy spellings to the stored value; unknown values are returned unchanged. */
export function normalizeWorkType(v?: string | null): string | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  const k = s.toLowerCase().replace(/[\s_-]+/g, "");
  if (["office", "onsite", "workfromoffice", "wfo"].includes(k)) return "On-site";
  if (["remote", "workfromhome", "wfh"].includes(k)) return "Remote";
  if (k === "hybrid") return "Hybrid";
  return s;
}

/** Display label; unknown legacy values are shown as-is. */
export function workTypeLabel(v?: string | null, empty = "None"): string {
  const n = normalizeWorkType(v);
  if (!n) return empty;
  return WORK_TYPES.find((w) => w.value === n)?.label ?? n;
}

/** Monthly CTC on record = annual total_salary / 12, or null when not set. */
export function monthlyCtcOnRecord(totalSalary?: number | string | null): number | null {
  const v = Number(totalSalary);
  if (!Number.isFinite(v) || v <= 0) return null;
  return v / 12;
}

/** "First Last" without a trailing space when last name is empty. */
export function fullName(e?: { first_name?: string | null; last_name?: string | null } | null): string {
  return [e?.first_name, e?.last_name].map((s) => (s ?? "").trim()).filter(Boolean).join(" ");
}

const DELETE_FK_REASONS: Record<string, string> = {
  hr_assets_assigned_to_fkey: "has assets assigned",
  hr_compoff_credits_employee_id_fkey: "has comp-off credits",
  hr_employee_notes_updated_by_fkey: "wrote employee notes",
  hr_employee_onboarding_reporting_manager_id_fkey: "is a reporting manager in onboarding",
  hr_employee_work_info_reporting_manager_id_fkey: "has people reporting to them",
  hr_feedback_360_reviewer_id_fkey: "is a feedback reviewer",
  hr_helpdesk_tickets_assigned_to_fkey: "has helpdesk tickets assigned",
  hr_helpdesk_tickets_raised_by_fkey: "raised helpdesk tickets",
  hr_leave_requests_approved_by_fkey: "approved leave requests",
  hr_payroll_runs_processed_by_fkey: "processed a payroll run",
  hr_penalties_employee_id_fkey: "has penalties",
  hr_stages_manager_id_fkey: "manages a pipeline stage",
};

/** Plain-words reason for a refused employee delete. */
export function employeeDeleteReason(err: { code?: string; message?: string; details?: string } | null | undefined): string {
  if (!err) return "you don't have permission to delete this employee";
  const text = `${err.message ?? ""} ${err.details ?? ""}`;
  if (err.code === "23503") {
    const hit = Object.keys(DELETE_FK_REASONS).find((k) => text.includes(k));
    return hit ? DELETE_FK_REASONS[hit] : "other records still point to this employee";
  }
  if (err.code === "P0001") return (err.message || "a lock rule refused it").replace(/^ERROR:\s*/, "");
  return err.message || "unknown error";
}
