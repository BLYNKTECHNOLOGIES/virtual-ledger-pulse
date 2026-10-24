/**
 * Standard CTC break-up for HR letters.
 *
 * Letters never ask HR for salary components: they are derived from the annual
 * CTC with the company's standard structure (Settings → RazorpayX default
 * structure, read through `hr_doc_standard_ctc_structure()`). Percentages are
 * of CTC; a "fixed" component is a fixed monthly amount — the same reading the
 * payroll screens use. Rounding drift lands in Special Allowance, as it does in
 * the payroll engine, so every column adds up to the CTC printed above it.
 */

export interface StructureComponent {
  key: string;
  label?: string | null;
  /** "percentage" (of CTC) or "fixed" (monthly amount). */
  mode?: string | null;
  value: number;
}

export interface BreakdownLine {
  key: string;
  label: string;
  /** Percentage of CTC, or null for a fixed component. */
  percent: number | null;
  monthly: number;
  annual: number;
}

export interface CtcBreakdown {
  annual: number;
  monthly: number;
  lines: BreakdownLine[];
  warnings: string[];
}

/** The company standard at the time of writing — used only when settings cannot be read. */
export const STANDARD_STRUCTURE_FALLBACK: StructureComponent[] = [
  { key: "basic", label: "Basic Salary", mode: "percentage", value: 50 },
  { key: "da", label: "DA", mode: "percentage", value: 0 },
  { key: "hra", label: "HRA", mode: "percentage", value: 25 },
  { key: "special", label: "Special Allowance", mode: "percentage", value: 15 },
  { key: "lta", label: "LTA", mode: "percentage", value: 10 },
];

/** Component that absorbs rounding drift (same convention as the payroll engine). */
export const BALANCING_KEY = "special";

/** Structure component key → the variable-name stem used in letters ("special" → special_allowance_monthly). */
export const COMPONENT_FIELD_STEM: Record<string, string> = {
  basic: "basic",
  da: "da",
  hra: "hra",
  special: "special_allowance",
  lta: "lta",
};

export function componentFieldStem(key: string): string {
  const k = String(key || "").toLowerCase().trim();
  return COMPONENT_FIELD_STEM[k] || k.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

/**
 * Parse an amount as HR types it — "1,63,200", "INR 1,63,200", "Rs. 163200",
 * "₹1,63,200/-", "4,80,000 p.a." — into a number. Anything that is not clearly a
 * single rupee figure ("1.5 lakh", "abc", "12-15k") is rejected with null rather
 * than guessed, so a letter can never print a misread salary.
 */
export function parseAmount(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const s = String(raw)
    .toLowerCase()
    .replace(/₹/g, " ")
    .replace(/\b(?:inr|rupees?|rs)\.?/g, " ")
    .replace(/\/-/g, " ")
    .replace(/\b(?:only|per\s+annum|per\s+month|p\.?\s?a|p\.?\s?m)\b\.?/g, " ")
    .replace(/\s+/g, "");
  if (!/^-?\d[\d,]*(?:\.\d+)?$/.test(s)) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Smallest annual CTC a letter will accept — catches a monthly figure or a typo. */
export const MIN_ANNUAL_CTC = 1000;

/** Keep only well-formed components; tolerate the jsonb shape coming back from the database. */
export function normaliseStructure(input: unknown): StructureComponent[] {
  if (!Array.isArray(input)) return [];
  const out: StructureComponent[] = [];
  for (const c of input as any[]) {
    if (!c || typeof c !== "object") continue;
    const key = String(c.key || "").toLowerCase().trim();
    const value = Number(c.value);
    if (!key || !Number.isFinite(value)) continue;
    out.push({ key, label: c.label ?? null, mode: c.mode ?? "percentage", value });
  }
  return out;
}

export function computeCtcBreakdown(annualCtc: number, structure: StructureComponent[]): CtcBreakdown {
  const warnings: string[] = [];
  const annual = Math.round(Math.max(0, Number(annualCtc) || 0));
  const monthly = Math.round(annual / 12);
  const components = structure.length ? structure : STANDARD_STRUCTURE_FALLBACK;

  const lines: BreakdownLine[] = components.map((c) => {
    const isFixed = String(c.mode || "percentage").toLowerCase() === "fixed";
    const pct = isFixed ? null : Number(c.value) || 0;
    const exactMonthly = isFixed ? Number(c.value) || 0 : (annual / 12) * (pct as number) / 100;
    const exactAnnual = isFixed ? (Number(c.value) || 0) * 12 : (annual * (pct as number)) / 100;
    return {
      key: c.key,
      label: c.label || c.key,
      percent: pct,
      monthly: Math.round(exactMonthly),
      annual: Math.round(exactAnnual),
    };
  });

  const pctTotal = lines.reduce((s, l) => s + (l.percent ?? 0), 0);
  const hasFixed = lines.some((l) => l.percent === null);
  if (!hasFixed && Math.abs(pctTotal - 100) > 0.001) {
    warnings.push(
      `The standard structure adds up to ${+pctTotal.toFixed(2)}% of CTC; Special Allowance has been adjusted so the break-up totals the CTC.`,
    );
  }

  let balancing = lines.find((l) => l.key === BALANCING_KEY);
  if (!balancing) {
    balancing = { key: BALANCING_KEY, label: "Special Allowance", percent: null, monthly: 0, annual: 0 };
    lines.push(balancing);
  }
  const monthlyDrift = monthly - lines.reduce((s, l) => s + l.monthly, 0);
  const annualDrift = annual - lines.reduce((s, l) => s + l.annual, 0);
  balancing.monthly += monthlyDrift;
  balancing.annual += annualDrift;
  if (balancing.monthly < 0 || balancing.annual < 0) {
    warnings.push("The fixed components exceed this CTC, so Special Allowance came out negative — check the CTC and the standard structure.");
  }

  return { annual, monthly, lines, warnings };
}

/**
 * Resolver-keyed salary facts for the letter dictionary:
 *   salary.annual_ctc, salary.monthly_ctc, derived.annual_ctc_words,
 *   salary.<stem>_monthly / salary.<stem>_annual for every component.
 * Components missing from the structure print as 0 (they are not part of the CTC).
 */
export function salarySource(
  annualCtc: number | null,
  structure: StructureComponent[],
): { source: Record<string, number | "">; breakdown: CtcBreakdown | null } {
  const source: Record<string, number | ""> = {};
  const stems = new Set<string>(Object.values(COMPONENT_FIELD_STEM));
  for (const c of structure) stems.add(componentFieldStem(c.key));

  if (!annualCtc || annualCtc <= 0) {
    source["salary.annual_ctc"] = "";
    source["salary.monthly_ctc"] = "";
    source["derived.annual_ctc_words"] = "";
    for (const stem of stems) {
      source[`salary.${stem}_monthly`] = "";
      source[`salary.${stem}_annual`] = "";
    }
    return { source, breakdown: null };
  }

  const breakdown = computeCtcBreakdown(annualCtc, structure);
  source["salary.annual_ctc"] = breakdown.annual;
  source["salary.monthly_ctc"] = breakdown.monthly;
  source["derived.annual_ctc_words"] = breakdown.annual;
  for (const stem of stems) {
    source[`salary.${stem}_monthly`] = 0;
    source[`salary.${stem}_annual`] = 0;
  }
  for (const line of breakdown.lines) {
    const stem = componentFieldStem(line.key);
    source[`salary.${stem}_monthly`] = line.monthly;
    source[`salary.${stem}_annual`] = line.annual;
  }
  return { source, breakdown };
}
