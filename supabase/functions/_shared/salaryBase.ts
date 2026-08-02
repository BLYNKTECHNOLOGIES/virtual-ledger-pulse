// Shared monthly salary-base resolution ladder.
//
// Both the shadow payroll engine and the auto-LOP generator must agree on the
// monthly base they deduct from, otherwise the staged LOP amount and the
// shadow line for the same employee would drift. Keep this the ONLY place the
// ladder is expressed.
//
// Order:
//   1. Salary structure assignment (annual CTC / 12)
//   2. RazorpayX-mirrored structure cache (component rows, annual amounts)
//   3. Imported Salary Register gross for the period
//   4. Onboarding annual CTC (local estimate)
//   5. Most recent imported payslip on or before this period

export type SalaryBaseSource =
  | "structure_assignment"
  | "razorpay_mirror"
  | "salary_register"
  | "onboarding_ctc"
  | "previous_payslip"
  | "none";

export interface SalaryBaseResult {
  monthlyGross: number;
  source: SalaryBaseSource;
  error?: string;
}

export async function resolveMonthlyGross(
  supabase: any,
  employeeId: string,
  periodStr: string, // YYYY-MM-01
  monthEndStr: string, // YYYY-MM-DD (last day of period)
): Promise<SalaryBaseResult> {
  const { data: salaryAssignArr, error: saErr } = await supabase
    .from("hr_employee_salary_structure_assignments")
    .select("*")
    .eq("employee_id", employeeId)
    .lte("created_at", `${monthEndStr}T23:59:59Z`)
    .order("created_at", { ascending: false })
    .limit(1);
  if (saErr) {
    return { monthlyGross: 0, source: "none", error: `salary_assignment: ${saErr.message}` };
  }

  let monthlyGross = 0;
  let source: SalaryBaseSource = "none";

  if (salaryAssignArr?.length) {
    monthlyGross = Number(salaryAssignArr[0]?.annual_ctc ?? 0) / 12;
    if (monthlyGross > 0) source = "structure_assignment";
  }

  if (!(monthlyGross > 0)) {
    const { data: mirror } = await supabase
      .from("hr_employee_salary_structures")
      .select("amount")
      .eq("employee_id", employeeId)
      .eq("is_active", true);
    const mirrorTotal = (mirror ?? []).reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
    if (mirrorTotal > 0) {
      // Mirror stores annual figures; anything below a month-scale threshold is already monthly.
      monthlyGross = mirrorTotal > 100000 ? mirrorTotal / 12 : mirrorTotal;
      source = "razorpay_mirror";
    }
  }

  if (!(monthlyGross > 0)) {
    const { data: reg } = await supabase
      .from("hr_razorpay_payslip_records")
      .select("gross_earnings, reg_gross_salary")
      .eq("hr_employee_id", employeeId)
      .eq("period_month", periodStr)
      .limit(1);
    const r: any = reg?.[0];
    monthlyGross = Number(r?.reg_gross_salary ?? r?.gross_earnings ?? 0);
    if (monthlyGross > 0) source = "salary_register";
  }

  if (!(monthlyGross > 0)) {
    // Preferred over an older payslip because prior-period payslips are often
    // partial months (mid-month joiners / training stints).
    const { data: onb } = await supabase
      .from("hr_employee_onboarding")
      .select("ctc")
      .eq("employee_id", employeeId)
      .limit(1);
    const annual = Number((onb?.[0] as any)?.ctc ?? 0);
    if (annual > 0) {
      monthlyGross = annual > 100000 ? annual / 12 : annual;
      source = "onboarding_ctc";
    }
  }

  if (!(monthlyGross > 0)) {
    const { data: prev } = await supabase
      .from("hr_razorpay_payslip_records")
      .select("gross_earnings, reg_gross_salary, period_month")
      .eq("hr_employee_id", employeeId)
      .lte("period_month", periodStr)
      .order("period_month", { ascending: false })
      .limit(1);
    const p: any = prev?.[0];
    monthlyGross = Number(p?.reg_gross_salary ?? p?.gross_earnings ?? 0);
    if (monthlyGross > 0) source = "previous_payslip";
  }

  monthlyGross = Math.round(monthlyGross);
  if (!(monthlyGross > 0)) return { monthlyGross: 0, source: "none" };
  return { monthlyGross, source };
}

export const SALARY_BASE_LABELS: Record<SalaryBaseSource, string> = {
  structure_assignment: "Salary structure assignment",
  razorpay_mirror: "RazorpayX mirrored structure",
  salary_register: "Imported Salary Register",
  onboarding_ctc: "Onboarding CTC (estimate)",
  previous_payslip: "Previous imported payslip",
  none: "Not resolved",
};
