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
