import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Read-only accessor for the HRMS mirror of RazorpayX Payroll Settings.
 * Use anywhere HRMS needs to know Razorpay's org-level payroll configuration
 * (PF wage base, ESI wage inclusion rules, which filings Razorpay handles, etc.).
 *
 * The row is the singleton `hr_razorpay_settings` record; values are updated
 * from the Compliance Settings page (/hrms/payroll/compliance-settings).
 */
export type ComplianceSettings = {
  xpayroll_handles_salary: boolean;
  xpayroll_handles_contractors: boolean;
  bank_transfer_method: "NEFT" | "IMPS" | "RTGS";
  bank_verification_upload_proof: boolean;
  bank_verification_auto_approve_name_match: boolean;
  compliance_files_salary_tds: boolean;
  compliance_files_nonsalary_tds: boolean;
  compliance_files_pf: boolean;
  compliance_files_esi: boolean;
  compliance_files_pt: boolean;
  pf_include_employer_in_ctc: boolean;
  pf_include_admin_edli_in_ctc: boolean;
  pf_wages_basic_only: boolean;
  pf_wage_cap_15000: boolean;
  esi_include_employer_in_ctc: boolean;
  esi_include_additions_in_wages: boolean;
  // Leave & attendance mirror
  attendance_enabled: boolean;
  attendance_enabled_for_contractors: boolean;
  weekend_sun: boolean;
  weekend_sat_1: boolean;
  weekend_sat_2: boolean;
  weekend_sat_3: boolean;
  weekend_sat_4: boolean;
  weekend_sat_5: boolean;
  leave_allow_negative_balance: boolean;
  leave_allow_half_day: boolean;
  leave_require_remark: boolean;
  attendance_show_on_payslip: boolean;
  lop_auto_add_for_unpaid: boolean;
  lop_calc_on_working_days: boolean;
  leave_calendar_financial_year: boolean;
  shifts_track_timings: boolean;
  leave_types_mirror: Array<{
    code: string; name: string;
    default_leave: number | null; monthly_increment: number | null;
    max_leave: number | null; carry_forward: number | null;
    include_weekends: boolean;
  }>;
  compliance_settings_updated_at: string | null;
  leave_settings_updated_at: string | null;
};

export function useComplianceSettings() {
  return useQuery({
    queryKey: ["hr_razorpay_settings_compliance_public"],
    queryFn: async (): Promise<ComplianceSettings | null> => {
      const { data, error } = await (supabase as any)
        .from("hr_razorpay_settings")
        .select("*")
        .eq("is_singleton", true)
        .maybeSingle();
      if (error) throw error;
      return (data as ComplianceSettings) ?? null;
    },
    staleTime: 60_000,
  });
}

/**
 * PF wage base per current mirror. Returns the amount used for the 12% PF
 * contribution calculation given a Basic and DA figure.
 */
export function pfWageBase(basic: number, da: number, s: ComplianceSettings | null | undefined): number {
  if (!s) return Math.min(basic || 0, 15000);
  const raw = s.pf_wages_basic_only ? (basic || 0) : (basic || 0) + (da || 0);
  return s.pf_wage_cap_15000 ? Math.min(raw, 15000) : raw;
}

/**
 * Detect statutory-filing mismatches on an imported Razorpay payslip row.
 * Returns an array of human-readable drift messages, empty if no mismatch.
 */
export function complianceDriftForPayslip(
  row: { tds_amount?: number | null; pf_amount?: number | null; esi_amount?: number | null; professional_tax?: number | null },
  s: ComplianceSettings | null | undefined,
): string[] {
  if (!s) return [];
  const out: string[] = [];
  if ((row.tds_amount ?? 0) > 0 && !s.compliance_files_salary_tds) {
    out.push("Payslip shows TDS but Razorpay is not configured to file salary TDS — you must remit it manually.");
  }
  if ((row.pf_amount ?? 0) > 0 && !s.compliance_files_pf) {
    out.push("Payslip shows PF but Razorpay PF filing is OFF.");
  }
  if ((row.esi_amount ?? 0) > 0 && !s.compliance_files_esi) {
    out.push("Payslip shows ESI but Razorpay ESI filing is OFF.");
  }
  if ((row.professional_tax ?? 0) > 0 && !s.compliance_files_pt) {
    out.push("Payslip shows PT but Razorpay PT filing is OFF.");
  }
  return out;
}

/**
 * Is the given date a weekly-off per the mirrored Razorpay weekend pattern?
 * Sundays honor `weekend_sun`; Saturdays honor `weekend_sat_1..5` where the
 * index is the ordinal Saturday of the month (1st, 2nd, ..., 5th).
 */
export function isWeeklyOff(d: Date, s: ComplianceSettings | null | undefined): boolean {
  if (!s) return d.getDay() === 0;
  const dow = d.getDay();
  if (dow === 0) return !!s.weekend_sun;
  if (dow === 6) {
    const nth = Math.floor((d.getDate() - 1) / 7) + 1; // 1..5
    return !!(s as any)[`weekend_sat_${nth}`];
  }
  return false;
}

/** Working days in a given calendar month (0-indexed month) using the mirror. */
export function workingDaysInMonth(year: number, month0: number, s: ComplianceSettings | null | undefined): number {
  const days = new Date(year, month0 + 1, 0).getDate();
  let count = 0;
  for (let day = 1; day <= days; day++) {
    if (!isWeeklyOff(new Date(year, month0, day), s)) count++;
  }
  return count;
}

/** Per-day salary basis for LOP given monthly gross, honoring the LOP toggle. */
export function lopPerDayBasis(
  monthlyGross: number,
  year: number,
  month0: number,
  s: ComplianceSettings | null | undefined,
): number {
  if (!monthlyGross) return 0;
  const totalDays = new Date(year, month0 + 1, 0).getDate();
  const divisor = s?.lop_calc_on_working_days ? workingDaysInMonth(year, month0, s) : totalDays;
  return divisor > 0 ? monthlyGross / divisor : 0;
}

