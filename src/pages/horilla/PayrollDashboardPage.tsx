import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wallet, TrendingUp, TrendingDown, Users, Lock, ExternalLink, FileText, Gauge } from "lucide-react";
import { StatutoryReportsPanel } from "@/components/hrms/StatutoryReportsPanel";
import { PayrollRunDetailDialog } from "@/components/hrms/payroll/PayrollRunDetailDialog";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { TableSkeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { isSuperAdminRoleName } from "@/lib/auth/roles";
import { isCockpitOpenableMonth } from "@/lib/hrms/cockpitMonths";

/** Display labels for RazorpayX run statuses (the stored values are unchanged). */
const RUN_STATUS_LABEL: Record<string, string> = {
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

interface MonthRow {
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
const monthLabel = (m: string) =>
  new Date(m).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

const statusColor = (status: string) => {
  switch (status) {
    case "bulk_applied": case "locked": return "bg-success/10 text-success";
    case "pilot_applied": case "dry_run_ok": case "computed": return "bg-info/10 text-info";
    case "recalled": return "bg-destructive/10 text-destructive";
    case "payslips_only": return "bg-warning/10 text-warning";
    case "payslips_imported": return "bg-muted text-muted-foreground";
    default: return "bg-muted text-foreground";
  }
};

export default function PayrollDashboardPage() {
  const [detailRun, setDetailRun] = useState<MonthRow | null>(null);

  // RazorpayX is the payroll authority — one row per month that has a RazorpayX
  // run row OR imported payslip records; totals come from the payslip records.
  // Run rows are readable only with RazorpayX Sync or as Super Admin (same rule
  // as RLS razorpay_payroll_runs_all); without it, never claim "no run record".
  const { user } = useAuth();
  const { hasPermission, isLoading: permsLoading } = usePermissions();
  const canReadRuns = Boolean(user?.roles?.some(isSuperAdminRoleName)) || hasPermission("hrms_razorpay_sync");
  const { data: runs = [], isLoading: runsLoading } = useQuery<MonthRow[]>({
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

  const totalGross = runs.reduce((s, r) => s + (r.total_gross || 0), 0);
  const totalNet = runs.reduce((s, r) => s + (r.total_net || 0), 0);
  const totalDeductions = runs.reduce((s, r) => s + (r.total_deductions || 0), 0);

  const statusChip = (r: MonthRow, size: "xs" | "sm") => (
    <div className="flex items-center gap-1 flex-wrap">
      {r.is_locked && (
        <span className={`inline-flex items-center gap-1 ${size === "xs" ? "text-[10px]" : "text-xs"} text-warning bg-warning/10 px-2 py-0.5 rounded-full`}>
          <Lock className="h-3 w-3" /> Locked
        </span>
      )}
      <span className={`px-2 py-0.5 rounded-full ${size === "xs" ? "text-[10px]" : "text-xs"} font-medium ${statusColor(r.status)}`}>
        {RUN_STATUS_LABEL[r.status] ?? String(r.status || "").replace(/_/g, " ")}
      </span>
    </div>
  );

  const actions = (r: MonthRow, mobile = false) => (
    <div className={`flex gap-1 ${mobile ? "flex-wrap pt-1" : ""}`} onClick={(e) => e.stopPropagation()}>
      <Button size="sm" variant="outline" aria-label="Breakdown" title="Breakdown" className={mobile ? "min-h-11 flex-1 text-xs" : "h-8 w-8 p-0"} onClick={() => setDetailRun(r)}>
        <FileText className={mobile ? "h-3 w-3 mr-1" : "h-4 w-4"} />{mobile && " Breakdown"}
      </Button>
      {isCockpitOpenableMonth(r.pay_period_start) && (
      <Button asChild size="sm" variant="ghost" aria-label="Open in Cockpit" title="Open in Cockpit" className={mobile ? "min-h-11 flex-1 text-xs" : "h-8 w-8 p-0"}>
        <Link to={`/hrms/payroll/cockpit?month=${r.pay_period_start.slice(0, 7)}`}>
          <Gauge className={mobile ? "h-3 w-3 mr-1" : "h-4 w-4"} />{mobile && " Open in Cockpit"}
        </Link>
      </Button>
      )}
    </div>
  );
  const isLoading = permsLoading || runsLoading;

  return (
    <div className="p-4 md:p-6 space-y-4 page-mount">
      <PageHeader
        title="Payroll Dashboard"
        description="Payroll runs mirrored from RazorpayX. Work each month in the Monthly Cockpit."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline" className="h-9">
              <Link to="/hrms/payroll/inputs">Payroll Inputs</Link>
            </Button>
            <Button asChild size="sm" className="h-9">
              <a href="https://x.razorpay.com/payroll" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5">Open RazorpayX <ExternalLink className="h-3.5 w-3.5" /></a>
            </Button>
          </div>
        }
      />

      <div className="rounded-md border border-warning/40 bg-warning/5 p-3 text-sm flex items-start gap-2">
        <Lock className="h-4 w-4 mt-0.5 text-warning" />
        <div>
          <div className="font-medium">RazorpayX is the payroll authority</div>
          <div className="text-muted-foreground mt-1">
            Payroll is <strong>computed and executed on RazorpayX</strong>. The rows below are a read-only mirror kept for record. Provide inputs (additions, deductions, do-not-pay, attendance) via <Link className="underline" to="/hrms/payroll/inputs">Payroll Inputs</Link>, then run the pay-cycle on the <a className="underline" href="https://x.razorpay.com/payroll" target="_blank" rel="noreferrer">RazorpayX dashboard</a>.
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 stagger-children">
        {[
          { label: "Payroll months", value: runs.length, icon: Wallet, color: "text-info", bg: "bg-info/10" },
          { label: "Gross · all months", value: `₹${totalGross.toLocaleString('en-IN')}`, icon: TrendingUp, color: "text-success", bg: "bg-success/10" },
          { label: "Deductions · all months", value: `₹${totalDeductions.toLocaleString('en-IN')}`, icon: TrendingDown, color: "text-destructive", bg: "bg-destructive/10" },
          { label: "Net pay · all months", value: `₹${totalNet.toLocaleString('en-IN')}`, icon: Users, color: "text-primary", bg: "bg-primary/10" },
        ].map((s) => (
          <Card key={s.label} className="h-full transition-shadow hover:shadow-md">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${s.bg}`}><s.icon className={`h-5 w-5 ${s.color}`} /></div>
              <div><p className="text-xl font-semibold tabular-nums">{s.value}</p><p className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Payroll Runs</CardTitle></CardHeader>
        <CardContent className="p-0">
          {/* Mobile cards */}
          <div className="lg:hidden divide-y">
            {isLoading ? (
              <div className="p-4"><TableSkeleton rows={5} columns={2} /></div>
            ) : runs.length === 0 ? (
              <EmptyState icon={Wallet} title="No payroll runs yet" description="Runs appear once RazorpayX payroll is synced — work the month in the Monthly Cockpit." />
            ) : (
              runs.map((r) => (
                <div key={r.id} className="p-4 space-y-2 cursor-pointer active:bg-muted/40" onClick={() => setDetailRun(r)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{r.title}</p>
                      <p className="text-[11px] text-muted-foreground">{r.pay_period_start} — {r.pay_period_end}</p>
                    </div>
                    <div className="flex-shrink-0">{statusChip(r, "xs")}</div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div><p className="text-[10px] uppercase text-muted-foreground">Emp</p><p className="tabular-nums">{r.employee_count || 0}</p></div>
                    <div><p className="text-[10px] uppercase text-muted-foreground">Gross</p><p className="text-success tabular-nums">₹{(r.total_gross || 0).toLocaleString('en-IN')}</p></div>
                    <div><p className="text-[10px] uppercase text-muted-foreground">Net</p><p className="font-semibold tabular-nums">₹{(r.total_net || 0).toLocaleString('en-IN')}</p></div>
                  </div>
                  {actions(r, true)}
                </div>
              ))
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  {["Title", "Run Date (IST)", "Employees", "Gross", "Deductions", "Net", "Status", "Actions"].map((h) => (
                    <th key={h} className={`px-3 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground ${["Employees", "Gross", "Deductions", "Net"].includes(h) ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={8} className="p-0"><TableSkeleton rows={5} columns={8} /></td></tr>
                ) : runs.length === 0 ? (
                  <tr><td colSpan={8}><EmptyState icon={Wallet} title="No payroll runs yet" description="Runs appear once RazorpayX payroll is synced — work the month in the Monthly Cockpit." /></td></tr>
                ) : (
                  runs.map((r) => (
                    <tr key={r.id} className="border-b hover:bg-muted/50 cursor-pointer" onClick={() => setDetailRun(r)}>
                      <td className="px-3 py-3 font-medium">{r.title}<span className="block text-[11px] font-normal text-muted-foreground">{r.pay_period_start} — {r.pay_period_end}</span></td>
                      <td className="px-3 py-3 tabular-nums whitespace-nowrap">{r.run_date}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{r.employee_count || 0}</td>
                      <td className="px-3 py-3 text-right text-success font-medium tabular-nums">₹{(r.total_gross || 0).toLocaleString('en-IN')}</td>
                      <td className="px-3 py-3 text-right text-destructive tabular-nums">₹{(r.total_deductions || 0).toLocaleString('en-IN')}</td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums">₹{(r.total_net || 0).toLocaleString('en-IN')}</td>
                      <td className="px-3 py-3">{statusChip(r, "sm")}</td>
                      <td className="px-3 py-3">{actions(r)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <PayrollRunDetailDialog
        open={!!detailRun}
        onOpenChange={(o) => !o && setDetailRun(null)}
        periodMonth={detailRun?.pay_period_start ?? null}
        title={detailRun?.title ? `${detailRun.title} — breakdown` : undefined}
      />

      {/* Statutory Reports */}
      <Card className="mt-6">
        <CardContent className="p-5">
          <StatutoryReportsPanel />
        </CardContent>
      </Card>
    </div>
  );
}
