// Shared monthly salary-base resolution ladder.
//
// Both the shadow payroll engine and the auto-LOP generator must agree on the
// monthly base they deduct from, otherwise the staged LOP amount and the
// shadow line for the same employee would drift. Keep this the ONLY place the
// ladder is expressed.
//
// AUTHORITY RULE (learned the hard way — July 2026, Satyam Shukla):
// RazorpayX pays from ITS OWN salary figure, and every deduction we push is
// subtracted from that figure. So the base we deduct against MUST be the same
// number RazorpayX pays. His July LOP was computed off a stale onboarding CTC
// of 1,80,000 (15,000/month) while RazorpayX paid 1,10,328 (9,194/month) —
// the deduction was ~63% too large and he was underpaid.
//
// Order:
//   1. RazorpayX annual CTC cached on hr_employees.total_salary (AUTHORITY)
//   2. Salary structure assignment (annual CTC / 12)
//   3. RazorpayX-mirrored structure cache (component rows, annual amounts)
//   4. Imported Salary Register regular gross for the period
//   5. Most recent imported payslip on or before this period
//   6. Onboarding annual CTC — LAST RESORT, and it is returned as an ERROR for
//      deduction purposes: a local estimate must never drive money.

export type SalaryBaseSource =
  | "structure_assignment"
  | "razorpay_ctc"
  | "razorpay_mirror"
  | "salary_register"
  | "onboarding_ctc"
  | "previous_payslip"
  | "none";

export interface SalaryBaseResult {
  monthlyGross: number;
  source: SalaryBaseSource;
  error?: string;
  /** Monthly salary mirrored from RazorpayX, when known. */
  razorpayMonthly?: number;
  /** True when the resolved base disagrees with the RazorpayX salary. */
  mismatch?: boolean;
  /** Set when an in-month CTC revision made the base a time-weighted figure. */
  revisionNote?: string;
}

/** Fraction of the RazorpayX salary a fallback base may differ by. */
const BASE_TOLERANCE = 0.01;

/**
 * CTC actually in force during the period (Sept 2026 owner ruling).
 *
 * `hr_employees.total_salary` mirrors the LATEST RazorpayX CTC, which for an
 * employee whose increment starts next month is the FUTURE salary — deducting
 * LOP against it over-charges the whole month (Aug 2026: Jay Vishnoi 14,000 and
 * Devang Parihar 16,000 used, while their training CTC of 10,000/month was what
 * August actually paid; the increment is effective 01-Sep).
 *
 * So the base is the calendar-day weighted average of the CTC in force across
 * the month, derived from APPLIED salary revisions. A revision effective
 * mid-month therefore yields a blended base — exactly what the part-month CTC
 * transition recovery/arrear assumes.
 */
async function revisionWeightedMonthly(
  supabase: any,
  employeeId: string,
  periodStr: string,
  monthEndStr: string,
  latestMonthly: number,
): Promise<{ monthly: number; note?: string } | null> {
  const { data: revs, error } = await supabase
    .from("hr_salary_revisions")
    .select("previous_total, new_total, effective_from, status")
    .eq("employee_id", employeeId)
    .not("new_total", "is", null)
    .order("effective_from", { ascending: true });
  if (error || !revs?.length) return null;

  const applied = (revs as any[]).filter(
    (r) => !r.status || ["APPLIED", "applied"].includes(String(r.status)),
  );
  if (!applied.length) return null;

  const monthStart = new Date(`${periodStr}T00:00:00Z`);
  const monthEnd = new Date(`${monthEndStr}T00:00:00Z`);
  const days = Math.round((monthEnd.getTime() - monthStart.getTime()) / 86400000) + 1;

  // CTC in force on day 1 = the newest revision effective on/before month start,
  // falling back to the "previous_total" of the next revision to come — that is
  // exactly the salary this month was paid on.
  const before = applied.filter((r) => new Date(`${r.effective_from}T00:00:00Z`) <= monthStart);
  const inMonth = applied.filter((r) => {
    const d = new Date(`${r.effective_from}T00:00:00Z`);
    return d > monthStart && d <= monthEnd;
  });
  const future = applied.filter((r) => new Date(`${r.effective_from}T00:00:00Z`) > monthEnd);

  const openingAnnual = before.length
    ? Number(before[before.length - 1].new_total ?? 0)
    : Number(inMonth[0]?.previous_total ?? future[0]?.previous_total ?? 0);
  if (!(openingAnnual > 0)) return null;


  if (!inMonth.length) {
    const monthly = Math.round(openingAnnual / 12);
    if (!(monthly > 0)) return null;
    return {
      monthly,
      note:
        Math.abs(monthly - latestMonthly) > 1
          ? `CTC in force this month is ₹${openingAnnual.toLocaleString("en-IN")}/yr; the ₹${(latestMonthly * 12).toLocaleString("en-IN")}/yr on record starts later.`
          : undefined,
    };
  }

  // Weight each CTC by the calendar days it applies to.
  let weighted = 0;
  let cursor = 1;
  let current = openingAnnual;
  for (const r of inMonth) {
    const startDay = new Date(`${r.effective_from}T00:00:00Z`).getUTCDate();
    weighted += (current / 12) * (startDay - cursor);
    cursor = startDay;
    current = Number(r.new_total ?? current);
  }
  weighted += (current / 12) * (days - cursor + 1);
  const monthly = Math.round(weighted / days);
  if (!(monthly > 0)) return null;
  return {
    monthly,
    note: `CTC changed mid-month — base is the day-weighted average of ₹${openingAnnual.toLocaleString("en-IN")} and ₹${Number(current).toLocaleString("en-IN")} per year.`,
  };
}




export async function resolveMonthlyGross(
  supabase: any,
  employeeId: string,
  periodStr: string, // YYYY-MM-01
  monthEndStr: string, // YYYY-MM-DD (last day of period)
): Promise<SalaryBaseResult> {
  // 1. AUTHORITY: RazorpayX annual CTC cached on the employee record.
  const { data: empRow } = await supabase
    .from("hr_employees")
    .select("total_salary")
    .eq("id", employeeId)
    .limit(1);
  const razorpayAnnual = Number((empRow?.[0] as any)?.total_salary ?? 0);
  // hr_employees.total_salary mirrors the RazorpayX CTC, which is annual by
  // definition. Never guess the unit from the magnitude.
  const razorpayMonthly = razorpayAnnual > 0 ? Math.round(razorpayAnnual / 12) : 0;

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
  let mismatch = false;
  let revisionNote: string | undefined;

  if (razorpayMonthly > 0) {
    monthlyGross = razorpayMonthly;
    source = "razorpay_ctc";
    // The CTC actually in force this month wins over the latest cached CTC.
    const inForce = await revisionWeightedMonthly(
      supabase,
      employeeId,
      periodStr,
      monthEndStr,
      razorpayMonthly,
    );
    if (inForce && inForce.monthly > 0) {
      monthlyGross = inForce.monthly;
      revisionNote = inForce.note;
    }
    // Flag (but do not follow) a local assignment that disagrees with payroll.
    const assigned = Number(salaryAssignArr?.[0]?.annual_ctc ?? 0) / 12;
    if (assigned > 0 && Math.abs(assigned - razorpayMonthly) > razorpayMonthly * BASE_TOLERANCE) {
      mismatch = true;
    }
  } else if (salaryAssignArr?.length) {
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
      // The RazorpayX-mirrored structure stores ANNUAL component amounts.
      monthlyGross = mirrorTotal / 12;
      source = "razorpay_mirror";
    }
  }

  if (!(monthlyGross > 0)) {
    // ONLY the 42-column Salary Register import is a monthly base. Rows pulled
    // from payroll:view-payroll carry the run's *prorated* salary (mid-month
    // joiners show figures like 387) — those must never become an LOP base.
    //
    // CRITICAL: use REGULAR gross, not the register's reported gross. RazorpayX
    // inflates gross with one-time payouts and then reverses them in the
    // "One-time Payments" column (e.g. 2,20,380 reported vs 29,000 regular).
    // Using reported gross would make one LOP day worth ~6x the real rate.
    const { data: reg } = await supabase
      .from("hr_payslip_gross_split_v")
      .select("regular_gross")
      .eq("hr_employee_id", employeeId)
      .eq("period_month", periodStr)
      .gt("regular_gross", 0)
      .limit(1);
    const r: any = reg?.[0];
    monthlyGross = Number(r?.regular_gross ?? 0);
    if (monthlyGross > 0) source = "salary_register";
  }


  if (!(monthlyGross > 0)) {
    // Same one-time-payout hazard as above: prefer the regular-gross split.
    const { data: prev } = await supabase
      .from("hr_payslip_gross_split_v")
      .select("regular_gross, period_month")
      .eq("hr_employee_id", employeeId)
      .lte("period_month", periodStr)
      .order("period_month", { ascending: false })
      .limit(1);
    const p: any = prev?.[0];
    monthlyGross = Number(p?.regular_gross ?? 0);
    if (monthlyGross > 0) source = "previous_payslip";
  }

  if (!(monthlyGross > 0)) {
    // LAST RESORT. Onboarding CTC is a locally typed estimate that is routinely
    // stale (it is not synced back from RazorpayX). It may describe the salary,
    // but it must never silently drive a deduction — surface it as an error.
    const { data: onb } = await supabase
      .from("hr_employee_onboarding")
      .select("ctc")
      .eq("employee_id", employeeId)
      .limit(1);
    const annual = Number((onb?.[0] as any)?.ctc ?? 0);
    if (annual > 0) {
      // hr_employee_onboarding.ctc is captured as an ANNUAL figure.
      return {
        monthlyGross: Math.round(annual / 12),
        source: "onboarding_ctc",
        razorpayMonthly: 0,
        error:
          "Salary base unverified: only the onboarding CTC estimate is available and it is not mirrored from RazorpayX. Sync this employee's salary from RazorpayX before staging a deduction.",
      };
    }
  }

  monthlyGross = Math.round(monthlyGross);
  if (!(monthlyGross > 0)) return { monthlyGross: 0, source: "none", razorpayMonthly };
  return { monthlyGross, source, razorpayMonthly, mismatch, revisionNote };
}


export const SALARY_BASE_LABELS: Record<SalaryBaseSource, string> = {
  structure_assignment: "Salary structure assignment",
  razorpay_ctc: "RazorpayX annual CTC",
  razorpay_mirror: "RazorpayX mirrored structure",
  salary_register: "Imported Salary Register",
  onboarding_ctc: "Onboarding CTC (estimate)",
  previous_payslip: "Previous imported payslip",
  none: "Not resolved",
};
