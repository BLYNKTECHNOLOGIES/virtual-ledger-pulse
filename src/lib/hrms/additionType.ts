/**
 * RazorpayX (Opfin) addition types.
 * The DB column `hr_payroll_input_additions.addition_type` is a smallint that
 * stores Opfin's numeric code — never the human string.
 *   0 = Bonus (also used for "Other", which Opfin has no code for)
 *   1 = Arrears
 *   2 = Reimbursement
 */
export const ADDITION_TYPE_CODES: Record<string, number> = {
  bonus: 0,
  arrears: 1,
  reimbursement: 2,
  other: 0,
};

export function additionTypeCode(type: unknown): number {
  if (typeof type === "number" && Number.isFinite(type)) return type;
  const key = String(type ?? "bonus").toLowerCase();
  return ADDITION_TYPE_CODES[key] ?? 0;
}

const LABELS: Record<number, string> = {
  0: "bonus",
  1: "arrears",
  2: "reimbursement",
};

/** Numeric code (as stored) back to the slug the proxy/UI understands. */
export function additionTypeSlug(code: unknown): string {
  if (typeof code === "string" && Number.isNaN(Number(code))) return code.toLowerCase();
  return LABELS[Number(code)] ?? "bonus";
}
