/**
 * Expands a locally-owned HRMS salary structure template into the exact
 * RazorpayX `people:set-salary` payload shape.
 *
 * RazorpayX has NO template CRUD API — the only write path is a per-employee
 * inline structure (see docs/PAYROLL_DOCTRINE.md). This module is the single
 * source of truth for translating our template rows into the hyphenated-key
 * component keys RazorpayX expects.
 *
 * Reference: https://razorpay.com/docs/payroll/multiple-salary-structure/
 *            documenter.getpostman.com/view/11662503/Tzm5HckE  → People : set-salary
 */

/** Reserved RazorpayX field keys that map to first-class components. */
export const RESERVED_RAZORPAY_KEYS = [
  "basic",
  "da",
  "hra",
  "special-allowance",
  "lta",
  "employer-pf",
  "employer-esi",
] as const;

export type ReservedRazorpayKey = (typeof RESERVED_RAZORPAY_KEYS)[number];

export interface TemplateItemInput {
  id?: string;
  component_id: string;
  calculation_type: "fixed" | "percentage" | "formula";
  value: number;
  percentage_of: "total_salary" | "basic_pay" | null;
  formula: string | null;
  is_variable: boolean;
  is_residual: boolean;
  razorpay_taxable: "yes" | "no" | "flexi" | null;
  // From joined hr_salary_components:
  hr_salary_components?: {
    id: string;
    name: string;
    code: string;
    component_type: string; // 'earning' | 'allowance' | 'deduction' | 'employer_contribution'
    razorpay_key: string | null;
  };
}

export interface RazorpaySalaryStructure {
  basic: number;
  da: number;
  hra: number;
  "special-allowance": number;
  lta: number;
  "employer-pf": number;
  "employer-esi": number;
  "custom-allowances": Array<{ name: string; amount: number; taxable: "yes" | "no" | "flexi" }>;
  deductions: Array<{ name: string; amount: number; taxable: boolean }>;
}

export interface ExpansionResult {
  monthlyCtc: number;
  breakdown: RazorpaySalaryStructure;
  totalCredited: number;
  residualAmount: number;
  residualComponentName: string | null;
  warnings: string[];
  errors: string[];
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Two-pass expansion:
 *   1. Compute all non-residual items using their calc mode (relative to
 *      monthlyCtc or basic).
 *   2. Assign the residual row = monthlyCtc - sum(non-residual earning items).
 *
 * We do NOT try to interpret arbitrary `formula` strings — templates that
 * use formulas produce a warning and their monthly amount is treated as 0
 * for RazorpayX; the operator must convert to fixed/percentage before push.
 */
export function expandTemplate(
  items: TemplateItemInput[],
  annualCtc: number,
): ExpansionResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  const monthlyCtc = round2(annualCtc / 12);
  if (!Number.isFinite(monthlyCtc) || monthlyCtc <= 0) {
    errors.push("Annual CTC must be a positive number.");
  }

  // Identify residual (must be exactly one on earning side).
  const residuals = items.filter((i) => i.is_residual);
  if (residuals.length > 1) errors.push("Only one component can be marked residual.");
  const residual = residuals[0] ?? null;

  // First find BASIC amount so percentage-of-basic can resolve.
  const basicItem = items.find(
    (i) => i.hr_salary_components?.razorpay_key === "basic" || i.hr_salary_components?.code === "BASIC",
  );
  let basicMonthly = 0;
  if (basicItem && !basicItem.is_residual) {
    basicMonthly = amountFor(basicItem, monthlyCtc, 0);
  }

  // Compute all non-residual items relative to CTC and basic.
  const computed: Array<{
    item: TemplateItemInput;
    amount: number;
    key: string | null;
    componentType: string;
  }> = [];

  for (const item of items) {
    if (item.is_residual) continue;
    const comp = item.hr_salary_components;
    const key = comp?.razorpay_key ?? null;
    const amt =
      item.calculation_type === "formula"
        ? (warnings.push(
            `Component "${comp?.name ?? item.component_id}" uses a formula — set a fixed / percentage value before pushing to RazorpayX.`,
          ),
          0)
        : amountFor(item, monthlyCtc, basicMonthly);
    computed.push({ item, amount: round2(amt), key, componentType: comp?.component_type ?? "earning" });
  }

  // Sum of earning-side (positive) components excluding deductions.
  const earningSum = computed
    .filter((c) => c.componentType !== "deduction")
    .reduce((s, c) => s + c.amount, 0);

  // Residual fills the gap.
  const residualAmount = residual ? round2(monthlyCtc - earningSum) : 0;
  if (residual && residualAmount < 0) {
    errors.push(
      `Non-residual components already exceed monthly CTC by ₹${Math.abs(residualAmount).toLocaleString(
        "en-IN",
      )}. Reduce them or increase CTC.`,
    );
  }

  const rp: RazorpaySalaryStructure = {
    basic: 0,
    da: 0,
    hra: 0,
    "special-allowance": 0,
    lta: 0,
    "employer-pf": 0,
    "employer-esi": 0,
    "custom-allowances": [],
    deductions: [],
  };

  const push = (key: string | null, item: TemplateItemInput, amount: number, componentType: string) => {
    const comp = item.hr_salary_components;
    if (key && (RESERVED_RAZORPAY_KEYS as readonly string[]).includes(key)) {
      (rp as any)[key] = round2(((rp as any)[key] ?? 0) + amount);
      return;
    }
    if (componentType === "deduction") {
      rp.deductions.push({
        name: comp?.name ?? "Deduction",
        amount: round2(amount),
        taxable: false,
      });
      return;
    }
    rp["custom-allowances"].push({
      name: comp?.name ?? "Allowance",
      amount: round2(amount),
      taxable: (item.razorpay_taxable ?? "yes") as "yes" | "no" | "flexi",
    });
  };

  for (const c of computed) push(c.key, c.item, c.amount, c.componentType);
  if (residual) {
    push(
      residual.hr_salary_components?.razorpay_key ?? null,
      residual,
      residualAmount,
      residual.hr_salary_components?.component_type ?? "earning",
    );
  }

  const totalCredited = round2(
    rp.basic +
      rp.da +
      rp.hra +
      rp["special-allowance"] +
      rp.lta +
      rp["employer-pf"] +
      rp["employer-esi"] +
      rp["custom-allowances"].reduce((s, a) => s + a.amount, 0),
  );

  // Sanity: earnings should sum to monthly CTC (deductions are separate).
  if (Math.abs(totalCredited - monthlyCtc) > 1) {
    warnings.push(
      `Earnings total ₹${totalCredited.toLocaleString("en-IN")} does not match monthly CTC ₹${monthlyCtc.toLocaleString(
        "en-IN",
      )} — mark a component as residual, or adjust values to close the gap.`,
    );
  }

  return {
    monthlyCtc,
    breakdown: rp,
    totalCredited,
    residualAmount,
    residualComponentName: residual?.hr_salary_components?.name ?? null,
    warnings,
    errors,
  };
}

function amountFor(item: TemplateItemInput, monthlyCtc: number, basicMonthly: number): number {
  if (item.calculation_type === "fixed") return Number(item.value) || 0;
  if (item.calculation_type === "percentage") {
    const base = item.percentage_of === "basic_pay" ? basicMonthly : monthlyCtc;
    return (Number(item.value) || 0) * base / 100;
  }
  return 0;
}
