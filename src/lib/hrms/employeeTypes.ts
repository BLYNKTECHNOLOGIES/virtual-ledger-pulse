/**
 * Canonical employee-type vocabulary for HRMS.
 *
 * Company policy: only three employment types exist — Permanent, Contract,
 * Intern. Legacy values (`full_time`, `Full-time`, `part_time`, `regular`)
 * map to `permanent`. Storage is always lowercase snake_case.
 */
export const EMPLOYEE_TYPES = [
  { value: "permanent", label: "Permanent" },
  { value: "contract", label: "Contract" },
  { value: "intern", label: "Intern" },
] as const;

export type EmployeeTypeValue = (typeof EMPLOYEE_TYPES)[number]["value"];

/** Normalize any historical/free-text employee type to a canonical value. */
export function normalizeEmployeeType(raw?: string | null): EmployeeTypeValue | "" {
  const s = (raw || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!s) return "";
  if (["contract", "contractor", "contractual", "consultant"].includes(s)) return "contract";
  if (["intern", "internship", "trainee"].includes(s)) return "intern";
  return "permanent";
}

/** Display label for any stored employee type. */
export function employeeTypeLabel(raw?: string | null): string {
  const v = normalizeEmployeeType(raw);
  return EMPLOYEE_TYPES.find((t) => t.value === v)?.label ?? "";
}
