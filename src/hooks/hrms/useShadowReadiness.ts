/**
 * Shadow Payroll readiness — computes the 4 input signals for a given month:
 *   1. Attendance coverage %  (distinct active employees with any daily row)
 *   2. Register imported      (any Razorpay payslip records for the period)
 *   3. Inputs staged count    (approved additions + deductions for the period)
 *   4. Enrollment resolved %  (active employees with PF/ESI/PT flags all set)
 *
 * The `readiness_tier` mirrors the derivation used inside compute-shadow-payroll
 * so the panel and the persisted `hr_shadow_payroll_runs.input_completeness`
 * agree byte-for-byte.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ReadinessTier = "trustworthy" | "approximate" | "unusable";

export interface ShadowReadiness {
  active_employees: number;
  attendance_coverage_pct: number;
  register_imported: boolean;
  register_employee_count: number;
  inputs_staged_count: number;
  enrollment_resolved_pct: number;
  readiness_tier: ReadinessTier;
  can_run: boolean; // attendance OR register present
}

function deriveTier(r: Omit<ShadowReadiness, "readiness_tier" | "can_run">): ReadinessTier {
  if (r.attendance_coverage_pct >= 90 && r.register_imported && r.enrollment_resolved_pct >= 80) {
    return "trustworthy";
  }
  if (r.attendance_coverage_pct >= 50 || r.register_imported) return "approximate";
  return "unusable";
}

export function useShadowReadiness(periodMonth: string) {
  return useQuery({
    queryKey: ["shadow_readiness", periodMonth],
    queryFn: async (): Promise<ShadowReadiness> => {
      // month bounds
      const d = new Date(periodMonth + "T00:00:00Z");
      const end = new Date(d);
      end.setUTCMonth(end.getUTCMonth() + 1);
      end.setUTCDate(0);
      const endStr = end.toISOString().slice(0, 10);

      // active employees (with statutory flag state)
      const { data: emps } = await (supabase as any)
        .from("hr_employees")
        .select("id, pf_enabled, esi_enabled, pt_enabled")
        .eq("is_active", true);
      const active = emps ?? [];
      const activeCount = active.length;
      const ids = active.map((e: any) => e.id);

      // attendance coverage — hr_attendance_daily uses employee_id (not hr_employee_id)
      let attendanceCoveragePct = 0;
      if (activeCount > 0 && ids.length > 0) {
        const { data: attRows } = await (supabase as any)
          .from("hr_attendance_daily")
          .select("employee_id")
          .gte("attendance_date", periodMonth)
          .lte("attendance_date", endStr)
          .in("employee_id", ids);
        const distinct = new Set((attRows ?? []).map((r: any) => r.employee_id));
        attendanceCoveragePct = Math.round((distinct.size / activeCount) * 100);
      }

      // register imported
      const { data: regRows, count: regCount } = await (supabase as any)
        .from("hr_razorpay_payslip_records")
        .select("hr_employee_id", { count: "exact" })
        .eq("period_month", periodMonth);
      const registerEmployeeCount = new Set((regRows ?? []).map((r: any) => r.hr_employee_id)).size;
      const registerImported = (regCount ?? 0) > 0;

      // inputs staged — neither input table has a `status` column; count all rows for the period.
      const [{ count: addCount }, { count: dedCount }] = await Promise.all([
        (supabase as any).from("hr_payroll_input_additions").select("id", { count: "exact", head: true })
          .eq("period_month", periodMonth),
        (supabase as any).from("hr_payroll_input_deductions").select("id", { count: "exact", head: true })
          .eq("period_month", periodMonth),
      ]);
      const inputsStagedCount = (addCount ?? 0) + (dedCount ?? 0);

      // enrollment resolved
      const enrollmentResolvedCount = active.filter(
        (e: any) => e.pf_enabled !== null && e.esi_enabled !== null && e.pt_enabled !== null,
      ).length;
      const enrollmentResolvedPct = activeCount > 0
        ? Math.round((enrollmentResolvedCount / activeCount) * 100)
        : 0;

      const base = {
        active_employees: activeCount,
        attendance_coverage_pct: attendanceCoveragePct,
        register_imported: registerImported,
        register_employee_count: registerEmployeeCount,
        inputs_staged_count: inputsStagedCount,
        enrollment_resolved_pct: enrollmentResolvedPct,
      };
      const readiness_tier = deriveTier(base);
      return {
        ...base,
        readiness_tier,
        can_run: attendanceCoveragePct > 0 || registerImported,
      };
    },
    enabled: !!periodMonth,
  });
}
