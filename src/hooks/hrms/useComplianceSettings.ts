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
  compliance_settings_updated_at: string | null;
};

export function useComplianceSettings() {
  return useQuery({
    queryKey: ["hr_razorpay_settings_compliance_public"],
    queryFn: async (): Promise<ComplianceSettings | null> => {
      const { data, error } = await (supabase as any)
        .from("hr_razorpay_settings")
        .select(
          "xpayroll_handles_salary,xpayroll_handles_contractors,bank_transfer_method,bank_verification_upload_proof,bank_verification_auto_approve_name_match,compliance_files_salary_tds,compliance_files_nonsalary_tds,compliance_files_pf,compliance_files_esi,compliance_files_pt,pf_include_employer_in_ctc,pf_include_admin_edli_in_ctc,pf_wages_basic_only,pf_wage_cap_15000,esi_include_employer_in_ctc,esi_include_additions_in_wages,compliance_settings_updated_at"
        )
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
