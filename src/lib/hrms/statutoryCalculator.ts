/**
 * Statutory helpers for the SHADOW payroll engine only.
 * These helpers implement the same rules the RazorpayX compliance mirror
 * describes so the shadow calculator can produce numbers comparable to
 * Razorpay's — WITHOUT baking any statutory row into the salary structure
 * itself. PF, ESI, PT and TDS are computed dynamically at run time from the
 * employee's monthly gross, structure split, YTD figures and the compliance
 * toggles.
 *
 * NEVER import this file from any employee-facing surface (profile CTC,
 * payslip PDFs, revision preview, etc.). Only the shadow engine and its
 * dedicated UI may consume it.
 */

import type { ComplianceSettings } from "@/hooks/hrms/useComplianceSettings";

// -----------------------------
// EPF (Employees' Provident Fund)
// -----------------------------
export function computePfWageBase(
  basic: number,
  da: number,
  s: ComplianceSettings | null | undefined,
): number {
  if (!s) return Math.min(basic || 0, 15000);
  const raw = s.pf_wages_basic_only ? (basic || 0) : (basic || 0) + (da || 0);
  return s.pf_wage_cap_15000 ? Math.min(raw, 15000) : raw;
}

export function computeEpf(basic: number, da: number, s: ComplianceSettings | null | undefined) {
  if (!s?.compliance_files_pf) return { employee: 0, employer: 0, admin_edli: 0, base: 0 };
  const base = computePfWageBase(basic, da, s);
  const employee = Math.round(base * 0.12);
  const employer = Math.round(base * 0.12); // 3.67% to EPF + 8.33% to EPS, split not surfaced
  // Admin + EDLI charges: greatest of ₹500 or 0.5% of PF wages per employer
  const admin_edli = s.pf_include_admin_edli_in_ctc ? Math.max(500, Math.round(base * 0.005)) : 0;
  return { employee, employer, admin_edli, base };
}

// -----------------------------
// ESI
// -----------------------------
export function isEsiEligible(regularMonthlyGross: number, s: ComplianceSettings | null | undefined): boolean {
  if (!s?.compliance_files_esi) return false;
  // Statutory ceiling ₹21,000 gross wages — computed on REGULAR wages only
  // (excluding overtime / one-off additions) at the start of the contribution period.
  return regularMonthlyGross <= 21000;
}

export function computeEsi(
  fullGrossIncludingAdditions: number,
  regularMonthlyGross: number,
  s: ComplianceSettings | null | undefined,
) {
  if (!isEsiEligible(regularMonthlyGross, s)) return { employee: 0, employer: 0, base: 0 };
  const base = s?.esi_include_additions_in_wages ? fullGrossIncludingAdditions : regularMonthlyGross;
  return {
    employee: Math.round(base * 0.0075),
    employer: Math.round(base * 0.0325),
    base,
  };
}

// -----------------------------
// Professional Tax (state-slab lookup)
// -----------------------------
export interface PtSlab {
  state_code: string;
  slab_min: number;
  slab_max: number | null;
  monthly_amount: number;
  special_month?: number | null; // e.g. Maharashtra Feb ₹300 extra
  special_amount?: number | null;
}

export function computePt(
  ptBaseAmount: number,
  stateCode: string,
  slabs: PtSlab[] | null | undefined,
  s: ComplianceSettings | null | undefined,
  periodMonth?: Date,
): number {
  if (!s?.compliance_files_pt || !slabs?.length || !stateCode) return 0;
  const stateSlabs = slabs.filter((sl) => sl.state_code === stateCode);
  if (!stateSlabs.length) return 0;
  const match = stateSlabs.find(
    (sl) => ptBaseAmount >= sl.slab_min && (sl.slab_max === null || ptBaseAmount <= (sl.slab_max ?? Infinity)),
  );
  if (!match) return 0;
  let amount = match.monthly_amount;
  if (periodMonth && match.special_month && (periodMonth.getMonth() + 1) === match.special_month && match.special_amount) {
    amount = match.special_amount;
  }
  return amount;
}

// -----------------------------
// TDS (YTD projection true-up)
// -----------------------------
// Simplified New/Old regime slabs FY 2025-26. This is intentionally
// conservative for the SHADOW engine only. RazorpayX remains authoritative.
const NEW_REGIME_SLABS: [number, number][] = [
  [400000, 0], // 0 - 4L: 0%
  [800000, 0.05], // 4-8L: 5%
  [1200000, 0.10], // 8-12L: 10%
  [1600000, 0.15], // 12-16L: 15%
  [2000000, 0.20], // 16-20L: 20%
  [2400000, 0.25], // 20-24L: 25%
  [Infinity, 0.30],
];
const OLD_REGIME_SLABS: [number, number][] = [
  [250000, 0],
  [500000, 0.05],
  [1000000, 0.20],
  [Infinity, 0.30],
];

export function projectAnnualTax(
  annualTaxable: number,
  regime: "new" | "old",
): number {
  if (annualTaxable <= 0) return 0;
  const slabs = regime === "old" ? OLD_REGIME_SLABS : NEW_REGIME_SLABS;
  let tax = 0;
  let prev = 0;
  for (const [ceiling, rate] of slabs) {
    if (annualTaxable > ceiling) {
      tax += (ceiling - prev) * rate;
      prev = ceiling;
    } else {
      tax += (annualTaxable - prev) * rate;
      break;
    }
  }
  // 4% cess
  tax = tax * 1.04;
  // 87A rebate (new regime up to 7L, old regime up to 5L) — approximated
  if (regime === "new" && annualTaxable <= 700000) tax = 0;
  if (regime === "old" && annualTaxable <= 500000) tax = 0;
  return Math.max(0, tax);
}

/**
 * True-up TDS for the current month.
 * @param projectedAnnualTaxable expected FY total taxable income
 * @param ytdTdsAlreadyPaid TDS already withheld in the FY (from Razorpay history)
 * @param monthsRemaining months remaining in the FY (including current)
 * @param regime "new" | "old"
 */
export function computeMonthlyTds(
  projectedAnnualTaxable: number,
  ytdTdsAlreadyPaid: number,
  monthsRemaining: number,
  regime: "new" | "old",
): number {
  if (monthsRemaining <= 0) return 0;
  const annualTax = projectAnnualTax(projectedAnnualTaxable, regime);
  const remaining = Math.max(0, annualTax - ytdTdsAlreadyPaid);
  return Math.round(remaining / monthsRemaining);
}

// -----------------------------
// Salary structure split (from Razorpay default mirror)
// -----------------------------
export interface StructureComponent {
  key: string;
  label: string;
  value: number;
  mode: "percentage" | "fixed";
  taxable: "yes" | "no" | "partially";
}

export function splitMonthlyStructure(
  monthlyGross: number,
  components: StructureComponent[] | null | undefined,
): Record<string, { label: string; amount: number; taxable: string }> {
  const out: Record<string, { label: string; amount: number; taxable: string }> = {};
  if (!components?.length || !monthlyGross) return out;

  // First pass: fixed components
  let remaining = monthlyGross;
  const percentageComps: StructureComponent[] = [];
  for (const c of components) {
    if (c.mode === "fixed") {
      const amt = Math.min(c.value, remaining);
      out[c.key] = { label: c.label, amount: amt, taxable: c.taxable };
      remaining -= amt;
    } else {
      percentageComps.push(c);
    }
  }
  // Second pass: percentage components on ORIGINAL monthlyGross (Razorpay convention)
  let pctTotal = 0;
  for (const c of percentageComps) {
    const amt = Math.round(monthlyGross * (c.value / 100));
    out[c.key] = { label: c.label, amount: amt, taxable: c.taxable };
    pctTotal += amt;
  }
  // Reconcile rounding drift into "special_allowance" if present
  const special = out["special_allowance"];
  if (special) {
    const currentSum = Object.values(out).reduce((s, v) => s + v.amount, 0);
    special.amount += monthlyGross - currentSum;
  }
  return out;
}
