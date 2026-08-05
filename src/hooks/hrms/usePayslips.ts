import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Canonical payslip reader — sourced from `hr_payslips_v` (view over
 * `hr_razorpay_payslip_records`). Doctrine: RazorpayX is the authority; the
 * legacy `hr_payslips` table is retained for historic/local runs only.
 *
 * All new payslip surfaces should read from this hook. Old surfaces that still
 * write to `hr_payslips` continue to work, and the Data Health "Payslip parity"
 * tile surfaces any orphans.
 */
export interface CanonicalPayslip {
  id: string;
  employee_id: string;
  period_month: string;
  gross: number;
  total_deductions: number;
  net: number;
  tds_amount: number;
  pf_amount: number;
  esi_amount: number;
  professional_tax: number;
  employer_pf: number | null;
  employer_esi: number | null;
  basic: number | null;
  hra: number | null;
  special_allowance: number | null;
  lta: number | null;
  dearness_allowance: number | null;
  loan_emi: number | null;
  advance_salary: number | null;
  one_time_payments: number | null;
  one_time_recovery: number | null;
  one_time_total: number | null;
  regular_gross: number | null;
  pay_head_lines: Array<{ label: string; amount: number; classification: string }> | null;

  working_days: number | null;
  register_source: string | null;
  has_register: boolean;
  pdf_url: string | null;
  pdf_storage_path: string | null;
  razorpay_payslip_id: number | null;
  pulled_at: string | null;
  source: "razorpay" | "register_csv";
}

export function useCanonicalPayslips(params?: {
  employeeId?: string;
  employeeIds?: string[];
  periodMonth?: string; // YYYY-MM-01
}) {
  const { employeeId, employeeIds, periodMonth } = params ?? {};
  const idList = (employeeIds && employeeIds.length ? employeeIds : employeeId ? [employeeId] : null);
  return useQuery({
    queryKey: ["hr_payslips_v", idList ? idList.join(",") : "all", periodMonth ?? "all"],
    queryFn: async () => {
      let q = (supabase as any)
        .from("hr_payslips_v")
        .select("*")
        .order("period_month", { ascending: false })
        .limit(500);
      if (idList) q = idList.length === 1 ? q.eq("employee_id", idList[0]) : q.in("employee_id", idList);
      if (periodMonth) q = q.eq("period_month", periodMonth);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as CanonicalPayslip[];
    },
  });
}


export function usePayslipOrphans() {
  return useQuery({
    queryKey: ["hr_payslip_link_orphans"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("hr_payslip_link_orphans");
      if (error) throw error;
      return (data ?? []) as Array<{
        legacy_id: string;
        employee_id: string;
        period_month: string;
        net_salary: number;
        status: string;
      }>;
    },
    staleTime: 60_000,
  });
}
