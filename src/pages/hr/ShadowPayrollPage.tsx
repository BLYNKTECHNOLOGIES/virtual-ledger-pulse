/**
 * Payroll Calculation (Building) — the SHADOW engine surface.
 *
 * Doctrine: RazorpayX is authority. This page is the ONLY place the shadow
 * engine's numbers may render. HR uses it to A/B our calculation against
 * Razorpay for 2–3 months and catch drift on either side. Nothing here is
 * a payout figure — the banner is loud on purpose.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, startOfMonth } from "date-fns";
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, Play, TestTube2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { SourceTag } from "@/components/hr/payroll/SourceTag";
import { ShadowReadinessPanel } from "@/components/hr/payroll/ShadowReadinessPanel";
import { useShadowReadiness } from "@/hooks/hrms/useShadowReadiness";
import { cn } from "@/lib/utils";

type Line = {
  id: string;
  hr_employee_id: string;
  period_month: string;
  monthly_gross: number;
  additions_total: number;
  lop_days: number;
  lop_amount: number;
  pf_employee: number;
  esi_employee: number;
  pt_amount: number;
  tds_amount: number;
  deductions_total: number;
  net_pay: number;
  razorpay_gross: number | null;
  razorpay_net: number | null;
  razorpay_pf: number | null;
  razorpay_esi: number | null;
  razorpay_pt: number | null;
  razorpay_tds: number | null;
  compute_notes: any;
};

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}
// P2: ±₹5 per-component tolerance to absorb ESI-Er-in-base circularity + rounding.
const DRIFT_TOLERANCE = 5;
function diff(a: number, b: number | null | undefined, tolerance = DRIFT_TOLERANCE): { delta: number; badge: string | null } {
  if (b === null || b === undefined) return { delta: 0, badge: null };
  const d = Math.round(a - b);
  if (Math.abs(d) <= tolerance) return { delta: d, badge: null };
  return {
    delta: d,
    badge: `${d > 0 ? "+" : ""}${d.toLocaleString("en-IN")}`,
  };
}

export default function ShadowPayrollPage() {
  const qc = useQueryClient();
  const [period, setPeriod] = useState<string>(format(startOfMonth(new Date()), "yyyy-MM-01"));
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: readiness, isLoading: readinessLoading } = useShadowReadiness(period);

  // Load latest run for this period
  const { data: run } = useQuery({
    queryKey: ["shadow_run", period],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("hr_shadow_payroll_runs")
        .select("*")
        .eq("period_month", period)
        .order("run_no", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const { data: lines } = useQuery({
    queryKey: ["shadow_lines", run?.id],
    queryFn: async (): Promise<Line[]> => {
      if (!run?.id) return [];
      const { data } = await (supabase as any)
        .from("hr_shadow_payroll_lines")
        .select("*")
        .eq("run_id", run.id)
        .order("net_pay", { ascending: false });
      return (data ?? []) as Line[];
    },
    enabled: !!run?.id,
  });

  const { data: employees } = useQuery({
    queryKey: ["shadow_emp_names"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("hr_employees")
        .select("id, first_name, last_name, badge_id, statutory_flags_source");
      const map: Record<string, { label: string; source: string | null }> = {};
      (data ?? []).forEach((e: any) => {
        map[e.id] = {
          label: `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() + (e.badge_id ? ` · ${e.badge_id}` : ""),
          source: e.statutory_flags_source ?? null,
        };
      });
      return map;
    },
  });

  const compute = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("compute-shadow-payroll", {
        body: { period_month: period },
      });
      if (error) {
        // Edge function returned 409 for insufficient inputs — surface a human message.
        const ctx = (error as any)?.context;
        try {
          const bodyText = ctx?.body ? await ctx.body : null;
          if (bodyText) {
            const parsed = typeof bodyText === "string" ? JSON.parse(bodyText) : bodyText;
            if (parsed?.error === "insufficient_inputs") {
              throw new Error(parsed.message ?? "Insufficient inputs for this period.");
            }
          }
        } catch (_) { /* fall through */ }
        throw error;
      }
      return data;
    },
    onSuccess: (data: any) => {
      const tier = data?.readiness_tier ?? "approximate";
      const msg = `Shadow run complete — ${data?.computed_count ?? 0} employees · ${tier}`;
      if (tier === "trustworthy") toast.success(msg);
      else toast.warning(msg + " — treat drift alerts as approximate.");
      qc.invalidateQueries({ queryKey: ["shadow_run", period] });
      qc.invalidateQueries({ queryKey: ["shadow_lines"] });
      qc.invalidateQueries({ queryKey: ["shadow_readiness", period] });
    },
    onError: (e: any) => toast.error(`Shadow run failed: ${e.message}`),
  });


  const totals = useMemo(() => {
    if (!lines) return { shadowGross: 0, shadowNet: 0, rzGross: 0, rzNet: 0, count: 0, missingRz: 0 };
    return lines.reduce(
      (acc, l) => ({
        shadowGross: acc.shadowGross + l.monthly_gross + l.additions_total - l.lop_amount,
        shadowNet: acc.shadowNet + l.net_pay,
        rzGross: acc.rzGross + (l.razorpay_gross ?? 0),
        rzNet: acc.rzNet + (l.razorpay_net ?? 0),
        count: acc.count + 1,
        missingRz: acc.missingRz + (l.razorpay_net === null ? 1 : 0),
      }),
      { shadowGross: 0, shadowNet: 0, rzGross: 0, rzNet: 0, count: 0, missingRz: 0 },
    );
  }, [lines]);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto page-mount">
      {/* Big loud banner — this page is advisory only */}
      <div className="rounded-xl border-2 border-amber-500/50 bg-amber-500/10 p-4 flex items-start gap-3">
        <TestTube2 className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <div className="text-sm font-semibold text-foreground">Payroll Calculation (Building) — advisory only</div>
          <p className="text-xs text-muted-foreground mt-1">
            This engine computes payroll locally using the RazorpayX compliance mirror to compare with Razorpay's numbers.
            <strong className="text-foreground"> RazorpayX remains the payout authority.</strong> Nothing on this page is
            used by employee profiles, payslips, or the payroll dashboard. Use it to catch drift while we validate
            the shadow logic over the next 2–3 months.
          </p>
        </div>
      </div>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-foreground">Shadow Payroll Calculator</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Second-opinion engine · Razorpay-mirror rules · isolated from HRMS payout flows
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="month"
            value={period.slice(0, 7)}
            onChange={(e) => setPeriod(`${e.target.value}-01`)}
            className="w-40 text-foreground"
          />
          <Button
            onClick={() => compute.mutate()}
            disabled={compute.isPending || readinessLoading || !readiness?.can_run}
            title={!readiness?.can_run
              ? "Import attendance or a payroll register for this month before running."
              : undefined}
          >
            {compute.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
            Run shadow calculation
          </Button>
        </div>
      </header>

      {/* Shadow readiness panel — the four inputs with RAG lights */}
      <ShadowReadinessPanel data={readiness} isLoading={readinessLoading} period={period} />

      {run?.readiness_tier && run.readiness_tier !== "trustworthy" && (
        <div className={cn(
          "rounded-lg border p-3 text-xs flex items-start gap-2",
          run.readiness_tier === "unusable"
            ? "border-destructive/40 bg-destructive/5 text-destructive"
            : "border-warning/40 bg-warning/5 text-foreground",
        )}>
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            The last run for {period.slice(0, 7)} was tagged <strong>{run.readiness_tier}</strong>.
            Drift alerts derived from it are approximate — verify against the missing input before acting.
          </span>
        </div>
      )}


      {/* Totals */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Employees</div>
          <div className="text-2xl font-semibold text-foreground">{totals.count}</div>
        </Card>
        <Card className="p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Shadow gross</div>
          <div className="text-2xl font-semibold text-foreground">{fmt(totals.shadowGross)}</div>
          <SourceTag source="local_estimate" compact className="mt-1" />
        </Card>
        <Card className="p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Shadow net</div>
          <div className="text-2xl font-semibold text-foreground">{fmt(totals.shadowNet)}</div>
          <SourceTag source="local_estimate" compact className="mt-1" />
        </Card>
        <Card className="p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Razorpay gross</div>
          <div className="text-2xl font-semibold text-foreground">{fmt(totals.rzGross)}</div>
          <SourceTag source="razorpay" compact className="mt-1" />
        </Card>
        <Card className="p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Razorpay net</div>
          <div className="text-2xl font-semibold text-foreground">{fmt(totals.rzNet)}</div>
          <SourceTag source="razorpay" compact className="mt-1" />
        </Card>
      </div>

      {totals.missingRz > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs text-muted-foreground flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" />
          {totals.missingRz} employee{totals.missingRz === 1 ? "" : "s"} have no Razorpay payslip imported for {period.slice(0, 7)} — comparison unavailable until the period is imported.
        </div>
      )}

      {/* Lines */}
      <Card className="overflow-hidden">
        {!run ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No shadow run for {period.slice(0, 7)} yet. Click "Run shadow calculation" to compute one.
          </div>
        ) : !lines?.length ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Run computed 0 lines — no active employees with a salary structure for this period.</div>
        ) : (
          <div className="divide-y divide-border">
            <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-muted/30 text-[10px] uppercase tracking-wide text-muted-foreground">
              <div className="col-span-3">Employee</div>
              <div className="col-span-2 text-right">Shadow gross</div>
              <div className="col-span-2 text-right">Razorpay gross</div>
              <div className="col-span-2 text-right">Shadow net</div>
              <div className="col-span-2 text-right">Razorpay net</div>
              <div className="col-span-1 text-right">Δ Net</div>
            </div>
            {lines.map((l) => {
              const shadowGross = l.monthly_gross + l.additions_total - l.lop_amount;
              const netDiff = diff(l.net_pay, l.razorpay_net);
              const isOpen = expandedId === l.id;
              return (
                <div key={l.id}>
                  <button
                    onClick={() => setExpandedId(isOpen ? null : l.id)}
                    className="w-full grid grid-cols-12 gap-2 px-4 py-2 items-center text-sm hover:bg-muted/20 text-left"
                  >
                    <div className="col-span-3 flex items-center gap-1 text-foreground truncate">
                      {isOpen ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                      <span className="truncate">{employees?.[l.hr_employee_id]?.label ?? l.hr_employee_id.slice(0, 8)}</span>
                      <ProvenanceBadge source={employees?.[l.hr_employee_id]?.source ?? null} />
                    </div>
                    <div className="col-span-2 text-right text-foreground">{fmt(shadowGross)}</div>
                    <div className="col-span-2 text-right text-muted-foreground">{fmt(l.razorpay_gross)}</div>
                    <div className="col-span-2 text-right text-foreground">{fmt(l.net_pay)}</div>
                    <div className="col-span-2 text-right text-muted-foreground">{fmt(l.razorpay_net)}</div>
                    <div className="col-span-1 text-right">
                      {netDiff.badge ? (
                        <Badge variant="outline" className={Math.abs(netDiff.delta) > 100 ? "border-destructive/50 text-destructive" : "border-warning/50 text-warning"}>
                          {netDiff.badge}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </div>
                  </button>
                  {isOpen && (
                    <div className="px-4 py-3 bg-muted/10 border-t border-border">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                        <Row label="LOP days" a={l.lop_days} />
                        <Row label="LOP amount" a={fmt(l.lop_amount)} />
                        <Row label="Additions" a={fmt(l.additions_total)} />
                        <RowDiff label="PF (Employee)" shadow={l.pf_employee} rz={l.razorpay_pf} />
                        <RowDiff label="ESI (Employee)" shadow={l.esi_employee} rz={l.razorpay_esi} />
                        <RowDiff label="Professional Tax" shadow={l.pt_amount} rz={l.razorpay_pt} />
                        <RowDiff
                          label={run?.include_tds_in_drift ? "TDS" : "TDS (drift ignored)"}
                          shadow={l.tds_amount}
                          rz={l.razorpay_tds}
                          suppress={!run?.include_tds_in_drift}
                        />
                        <RowDiff label="Total deductions" shadow={l.deductions_total} rz={null} />
                        <RowDiff label="Net pay" shadow={l.net_pay} rz={l.razorpay_net} />
                      </div>
                      {l.compute_notes && (
                        <div className="mt-3 text-[10px] text-muted-foreground font-mono">
                          Regime: {l.compute_notes.regime} · Months left: {l.compute_notes.monthsRemaining}
                          {" · "}Annual base (pre-LOP): ₹{Math.round(l.compute_notes.annualBasePreLop ?? l.compute_notes.projectedAnnualTaxable ?? 0).toLocaleString("en-IN")}
                          {" · "}YTD TDS paid: ₹{Math.round(l.compute_notes.ytdTdsPaid ?? 0).toLocaleString("en-IN")}
                          {" · "}TDS: {l.compute_notes.tds_fy ?? "legacy"}
                          {" · "}Flags: {l.compute_notes.statutory_flags_source ?? "unknown"}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function Row({ label, a }: { label: string; a: any }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium">{a}</span>
    </div>
  );
}
function RowDiff({ label, shadow, rz }: { label: string; shadow: number; rz: number | null }) {
  const d = diff(shadow, rz);
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2">
        <span className="text-foreground">{fmt(shadow)}</span>
        {rz !== null && (
          <>
            <span className="text-muted-foreground">vs</span>
            <span className="text-muted-foreground">{fmt(rz)}</span>
            {d.badge && (
              <Badge variant="outline" className={Math.abs(d.delta) > 50 ? "border-destructive/50 text-destructive text-[10px]" : "border-warning/50 text-warning text-[10px]"}>
                {d.badge}
              </Badge>
            )}
          </>
        )}
      </span>
    </div>
  );
}
