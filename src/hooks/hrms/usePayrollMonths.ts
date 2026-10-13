import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { isSuperAdminRoleName } from "@/lib/auth/roles";

/** Display labels for RazorpayX run statuses (the stored values are unchanged). */
export const RUN_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  computed: "Computed",
  dry_run_ok: "Dry run OK",
  pilot_applied: "Pilot sent",
  bulk_applied: "Sent to RazorpayX",
  locked: "Locked",
  recalled: "Recalled",
  payslips_only: "Payslips imported · no run record",
  payslips_imported: "Payslips imported",
};

export interface MonthRow {
  id: string;
  title: string;
  pay_period_start: string;
  pay_period_end: string;
  run_date: string;
  employee_count: number;
  total_gross: number;
  total_deductions: number;
  total_net: number;
  status: string;
  is_locked: boolean;
}

const istDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) : "—";

// Display only: last day of the month, computed in UTC so IST browsers don't show the 29th/30th.
const monthEnd = (m: string) => {
  const d = new Date(m);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
};
export const monthLabel = (m: string) =>
  new Date(m).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

export const statusColor = (status: string) => {
  switch (status) {
    case "bulk_applied": case "locked": return "bg-success/10 text-success";
    case "pilot_applied": case "dry_run_ok": case "computed": return "bg-info/10 text-info";
    case "recalled": return "bg-destructive/10 text-destructive";
    case "payslips_only": return "bg-warning/10 text-warning";
    case "payslips_imported": return "bg-muted text-muted-foreground";
    default: return "bg-muted text-foreground";
  }
};


/** One row per payroll month (RazorpayX runs + imported payslip records), newest first. */
export function usePayrollMonths() {
  // RazorpayX is the payroll authority — one row per month that has a RazorpayX
  // run row OR imported payslip records; totals come from the payslip records.
  // Run rows are readable only with RazorpayX Sync or as Super Admin (same rule
  // as RLS razorpay_payroll_runs_all); without it, never claim "no run record".
  const { user } = useAuth();
  const { hasPermission, isLoading: permsLoading } = usePermissions();
  const canReadRuns = Boolean(user?.roles?.some(isSuperAdminRoleName)) || hasPermission("hrms_razorpay_sync");
  const { data: months = [], isLoading: runsLoading } = useQuery<MonthRow[]>({
    queryKey: ["hr_payroll_runs_mirror", canReadRuns],
    enabled: !permsLoading,
    queryFn: async () => {
      const [{ data: rzRuns, error: runErr }, recs] = await Promise.all([
        canReadRuns
          ? (supabase as any).from("hr_razorpay_payroll_runs").select("*").order("period_month", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        fetchAllPaginated<any>(() =>
          (supabase as any)
            .from("hr_razorpay_payslip_records")
            .select("id, period_month, gross_earnings, total_deductions, net_pay, reg_gross_salary, reg_net_pay")
            .order("id", { ascending: true }),
        ),
      ]);
      if (runErr) throw runErr;

      const agg = new Map<string, { emps: number; gross: number; ded: number; net: number }>();
      for (const r of recs || []) {
        const key = String(r.period_month).slice(0, 10);
        const cur = agg.get(key) || { emps: 0, gross: 0, ded: 0, net: 0 };
        cur.emps += 1;
        cur.gross += Number(r.gross_earnings ?? r.reg_gross_salary ?? 0);
        cur.ded += Number(r.total_deductions ?? 0);
        cur.net += Number(r.net_pay ?? r.reg_net_pay ?? 0);
        agg.set(key, cur);
      }

      // Latest run row per month (runs are ordered newest month first).
      const runByMonth = new Map<string, any>();
      for (const r of rzRuns || []) {
        const key = String(r.period_month).slice(0, 10);
        const prev = runByMonth.get(key);
        if (!prev || String(r.created_at) > String(prev.created_at)) runByMonth.set(key, r);
      }

      const months = Array.from(new Set([...runByMonth.keys(), ...agg.keys()])).sort().reverse();
      return months.map((m) => {
        const r = runByMonth.get(m);
        const a = agg.get(m) || { emps: 0, gross: 0, ded: 0, net: 0 };
        return {
          id: r?.id ?? `payslips-${m}`,
          title: `Payroll — ${monthLabel(m)}`,
          pay_period_start: m,
          pay_period_end: monthEnd(m),
          run_date: istDate(r?.created_at),
          employee_count: a.emps || r?.headcount_included || 0,
          total_gross: Number(r?.totals_gross) || a.gross,
          total_deductions: Number(r?.totals_deductions) || a.ded,
          total_net: Number(r?.totals_net) || a.net,
          status: r ? r.status : canReadRuns ? "payslips_only" : "payslips_imported",
          is_locked: !!r?.locked_at,
        };
      });
    },
  });

  return { months, isLoading: permsLoading || runsLoading, canReadRuns, permsLoading };
}
