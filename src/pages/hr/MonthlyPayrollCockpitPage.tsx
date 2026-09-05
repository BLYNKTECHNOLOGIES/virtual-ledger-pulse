import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { CockpitToolSheet, type CockpitToolKey } from "@/components/hrms/CockpitToolSheet";
import {
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  ChevronUp,

  Lock,
  Activity,
  TrendingUp,
  Upload,
  FileText,
  Calculator,
  Scale,
  Flag,
  ExternalLink,
  FileSpreadsheet,
  UserCheck,
  Bot,
} from "lucide-react";
import { VerificationPackDialog } from "@/components/hr/payroll/VerificationPackDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useCockpitMonth,
  useAckCockpitStep,
  useCloseMonth,
  firstOfMonth,
  type CockpitStep,
} from "@/hooks/hrms/useCockpit";
import { usePayrollStepGate } from "@/hooks/hrms/usePayrollStepGate";
import { useMandatoryRecalcs } from "@/hooks/hrms/useMandatoryRecalcs";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const STEP_ICONS: Record<string, any> = {
  lock_attendance: Lock,
  watchdog_zero: Activity,
  separations_fnf: UserCheck,
  salary_revisions: Scale,
  lop_push: TrendingUp,
  inputs_push: Upload,
  run_on_razorpay: ExternalLink,
  import_payslips: FileText,
  shadow_compare: Calculator,
  drift_review: Scale,
  close_month: Flag,
};

/** Presentation-only grouping of the same 10 steps into readable stages. */
const STEP_STAGE: Record<string, string> = {
  lock_attendance: "Attendance",
  watchdog_zero: "Attendance",
  separations_fnf: "Separations",
  salary_revisions: "Compensation",
  lop_push: "Compensation",
  inputs_push: "Compensation",
  run_on_razorpay: "Run",
  import_payslips: "Reconcile",
  shadow_compare: "Reconcile",
  drift_review: "Reconcile",
  close_month: "Close",
};

const STAGE_ORDER = ["Attendance", "Separations", "Compensation", "Run", "Reconcile", "Close"];

type StepTarget =
  | { tool: CockpitToolKey; label: string; params?: Record<string, string> }
  | { href: string; label: string };

const STEP_TARGET: Record<string, StepTarget> = {
  lock_attendance: { tool: "period_locks", label: "Open Period Locks" },
  watchdog_zero: { tool: "stale_sessions", label: "Open Stale Sessions" },
  separations_fnf: { tool: "separations", label: "Open Separations & F&F" },
  salary_revisions: { tool: "salary_revisions", label: "Open Salary Revisions" },
  lop_push: { tool: "inputs", label: "Open LOP deductions", params: { tab: "deduction", focus: "lop" } },
  inputs_push: { tool: "inputs", label: "Open additions / deductions", params: { tab: "addition" } },
  run_on_razorpay: { href: "https://x.razorpay.com/payroll/runs", label: "Open RazorpayX Dashboard" },
  import_payslips: { tool: "payslip_emails", label: "Import & email payslips" },
  shadow_compare: { tool: "shadow", label: "Run Shadow Payroll" },
  drift_review: { tool: "data_health", label: "Open Data Health" },
};


const ROUTINE_TOOLS: { tool: CockpitToolKey; label: string; icon: any }[] = [
  { tool: "inputs", label: "Payroll Inputs", icon: Upload },
  { tool: "salary_revisions", label: "Salary Revisions", icon: Scale },
  { tool: "salary_register", label: "Import Salary Register", icon: FileText },
  { tool: "payslip_import", label: "Import Payslips", icon: FileText },
  { tool: "payslip_emails", label: "Payslip Email Dispatch", icon: FileText },
];

const DIAGNOSTIC_TOOLS: { tool: CockpitToolKey; label: string; icon: any }[] = [
  { tool: "shadow", label: "Shadow Payroll", icon: Calculator },
  { tool: "razorpay_sync", label: "RazorpayX Diagnostics", icon: Activity },
  { tool: "system_pulse", label: "System Pulse", icon: Activity },
  { tool: "data_health", label: "Data Health", icon: Scale },
];

function generateRecentMonths(countBack: number, countForward: number): string[] {
  const months: string[] = [];
  const now = new Date();
  // Newest first: +countForward … current … -countBack
  for (let i = countForward; i >= -countBack; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    months.push(firstOfMonth(d));
  }
  return months;
}

function monthOptions(): { value: string; label: string }[] {
  return generateRecentMonths(12, 3).map((m) => {
    const d = new Date(m + "T00:00:00Z");
    return {
      value: m,
      label: d.toLocaleString("en-IN", { month: "long", year: "numeric" }),
    };
  });
}

/** Cockpit history floor — payroll cycles before this month are not tracked in
 *  the cockpit, so they must never be auto-selected. */
const COCKPIT_FIRST_TRACKED_MONTH = "2026-07-01";

/** Find the OLDEST cycle month (from the tracked floor onwards) whose payroll
 *  close is not yet acknowledged — that is the cycle still pending work. Future
 *  months are never candidates; if everything past is closed we land on the
 *  current month. */
function useLatestIncompleteCockpitMonth() {
  return useQuery({
    queryKey: ["hr_cockpit_latest_incomplete_month"],
    queryFn: async () => {
      // current → previous 12 months, then oldest-first, floored at the tracked start
      const candidates = generateRecentMonths(12, 0)
        .slice()
        .reverse()
        .filter((m) => m >= COCKPIT_FIRST_TRACKED_MONTH);

      const results = await Promise.all(
        candidates.map(async (m) => {
          const { data, error } = await (supabase as any).rpc("hr_cockpit_month_state", { _month: m });
          if (error) return { month: m, closed: true }; // don't strand the user on an unreadable month
          const steps = (data ?? []) as CockpitStep[];
          const closeStep = steps.find((s) => s.step_key === "close_month");
          return { month: m, closed: closeStep?.ack_status === "done" };
        })
      );
      const oldestIncomplete = candidates.find((_, idx) => !results[idx].closed);
      return oldestIncomplete ?? firstOfMonth(new Date());
    },
    staleTime: 5 * 60 * 1000,
  });
}


/** System-side (live) state chip — what the data says. */
function LiveChip({ step }: { step: CockpitStep }) {
  if (step.live_status === "complete")
    return (
      <Badge variant="outline" className="border-success/40 bg-success/10 text-success gap-1">
        <CheckCircle2 className="h-3 w-3 shrink-0" /> System: complete
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-muted-foreground gap-1">
      <Circle className="h-3 w-3 shrink-0" /> System: pending
    </Badge>
  );
}

/** Human-side (acknowledgement) chip — what the operator confirmed. */
function AckChip({ step }: { step: CockpitStep }) {
  if (step.ack_status === "done")
    return (
      <Badge className="bg-success/15 text-success border-success/30 gap-1">
        <CheckCircle2 className="h-3 w-3 shrink-0" /> Confirmed
      </Badge>
    );
  if (step.ack_status === "skipped") return <Badge variant="outline">Skipped</Badge>;
  if (step.ack_status === "blocked")
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertTriangle className="h-3 w-3 shrink-0" /> Blocked
      </Badge>
    );
  if (step.auto && step.live_status === "complete")
    return (
      <Badge variant="outline" className="border-info/40 bg-info/10 text-info gap-1">
        <Bot className="h-3 w-3 shrink-0" /> Automatic
      </Badge>
    );
  if (step.live_status === "complete")
    return (
      <Badge variant="outline" className="border-info/40 bg-info/10 text-info">
        Ready to confirm
      </Badge>
    );
  return <Badge variant="outline" className="text-muted-foreground">Not confirmed</Badge>;
}

function StepIcon({ step }: { step: CockpitStep }) {
  if (step.ack_status === "done")
    return <CheckCircle2 className="h-5 w-5 text-success shrink-0" />;
  if (step.ack_status === "blocked")
    return <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />;
  if (step.live_status === "complete")
    return <CheckCircle2 className="h-5 w-5 text-info shrink-0" />;
  return <Circle className="h-5 w-5 text-muted-foreground shrink-0" />;
}


function plural(n: any, word: string): string {
  return Number(n ?? 0) === 1 ? word : `${word}s`;
}

function DetailLine({ step }: { step: CockpitStep }) {
  const d = step.live_detail ?? {};
  switch (step.step_key) {
    case "lock_attendance":
      if (d.has_system_lock) {
        const when = d.latest_locked_at ? new Date(d.latest_locked_at).toLocaleDateString("en-IN") : "—";
        return <span>Auto-locked by the system on {when}.</span>;
      }
      return (d.locked_ranges ?? 0) > 0 ? (
        <span>{d.locked_ranges} attendance {plural(d.locked_ranges, "period")} locked for this month.</span>
      ) : (
        <span>No attendance period locked yet.</span>
      );
    case "watchdog_zero":
      return (d.stale_open ?? 0) > 0 ? (
        <span>{d.stale_open} stale {plural(d.stale_open, "session")} still open.</span>
      ) : (
        <span>No stale sessions.</span>
      );
    case "separations_fnf": {
      const parts: string[] = [];
      if ((d.fnf_total ?? 0) > 0) parts.push(`${d.fnf_total} F&F ${plural(d.fnf_total, "settlement")} in this cycle`);
      if ((d.fnf_open ?? 0) > 0) parts.push(`${d.fnf_open} still unfinished`);
      if ((d.fnf_approved_unpushed ?? 0) > 0) parts.push(`${d.fnf_approved_unpushed} approved but not pushed to RazorpayX`);
      if ((d.exits_without_fnf ?? 0) > 0) parts.push(`${d.exits_without_fnf} exit ${plural(d.exits_without_fnf, "employee")} with no settlement`);
      if (parts.length === 0) return <span>Nothing to settle this cycle.</span>;
      return <span>{parts.join(" · ")}.</span>;
    }
    case "salary_revisions": {
      const parts: string[] = [];
      if ((d.rev_rows ?? 0) > 0) parts.push(`${d.rev_rows} ${plural(d.rev_rows, "revision")} effective this month`);
      if ((d.rev_pending ?? 0) > 0) parts.push(`${d.rev_pending} pending`);
      if ((d.rev_unsynced ?? 0) > 0) parts.push(`${d.rev_unsynced} not yet pushed to RazorpayX`);
      if (Number(d.one_time_total ?? 0) > 0) parts.push(`one-time payable ₹${Number(d.one_time_total).toLocaleString("en-IN")}`);
      if (Number(d.one_time_recorded_total ?? 0) > 0) parts.push(`₹${Number(d.one_time_recorded_total).toLocaleString("en-IN")} already paid outside payroll (recorded only)`);
      if (parts.length === 0) return <span>No salary revisions for this month.</span>;
      return <span>{parts.join(" · ")}.</span>;
    }
    case "lop_push": {
      const rows = d.lop_rows ?? 0;
      if (rows === 0) return <span>No LOP deductions staged.</span>;
      const parts: string[] = [`${rows} LOP ${plural(rows, "row")} staged`];
      if ((d.auto_rows ?? 0) > 0) parts.push(`${d.auto_rows} auto-calculated (${Number(d.auto_lop_days ?? 0)} LOP days)`);
      return (
        <span>
          {parts.join(" · ")} · <strong>{d.verified_rows ?? 0}/{rows} verified in RazorpayX</strong>.
        </span>
      );
    }
    case "inputs_push": {
      const parts: string[] = [];
      if ((d.input_rows ?? 0) > 0)
        parts.push(`${d.input_rows} ${plural(d.input_rows, "input")} staged`);
      if ((d.rec_rows ?? 0) > 0)
        parts.push(`${d.rec_rows} recovery ${plural(d.rec_rows, "installment")} of ₹${Number(d.rec_amount ?? 0).toLocaleString("en-IN")} — ${d.rec_pushed ?? 0} pushed${(d.rec_failed ?? 0) > 0 ? `, ${d.rec_failed} failed` : ""}`);
      if (parts.length === 0) return <span>Nothing staged for this month.</span>;
      return (
        <span>
          {parts.join(" · ")}
          {(d.input_rows ?? 0) > 0 ? (
            <> · <strong>{d.input_verified ?? 0}/{d.input_rows} verified in RazorpayX</strong></>
          ) : null}
          .
        </span>
      );
    }
    case "run_on_razorpay":
      return (
        <span className="text-warning">
          RazorpayX cannot confirm a payroll run via API — run payroll on the dashboard, then mark this step done.
          {d.processed_on ? ` Credited on ${new Date(String(d.processed_on)).toLocaleDateString("en-IN")}.` : ""}
        </span>
      );
    case "import_payslips": {
      const parts: string[] = [];
      if ((d.imported ?? 0) > 0) parts.push(`${d.imported} ${plural(d.imported, "payslip")} imported`);
      if ((d.register_rows ?? 0) > 0) parts.push(`${d.register_rows} register ${plural(d.register_rows, "row")}`);
      if ((d.with_pdf ?? 0) > 0) parts.push(`${d.with_pdf} PDF ${plural(d.with_pdf, "file")} attached`);
      if (parts.length === 0) return <span>No payslips imported yet.</span>;
      return (
        <span>
          {parts.join(" · ")} · <strong>{d.emails_sent ?? 0}/{d.payable ?? 0} emailed</strong>
          {(d.register_rows ?? 0) === 0 ? " — upload the register CSV before emailing" : ""}.
        </span>
      );
    }
    case "shadow_compare":
      return d.run_id ? (
        <span>Shadow run {String(d.run_id).slice(0, 8)} · {d.status || "—"}</span>
      ) : (
        <span>No shadow run yet.</span>
      );
    case "drift_review":
      return (d.drift_open ?? 0) > 0 ? (
        <span>{d.drift_open} unexplained drift {plural(d.drift_open, "alert")} need review.</span>
      ) : (
        <span>No unexplained drift.</span>
      );
    case "close_month":
      return <span>Closes the month and freezes acknowledgements.</span>;
    default:
      return null;
  }
}

export default function MonthlyPayrollCockpitPage() {
  const [month, setMonth] = useState<string>(() => {
    const d = new Date();
    return firstOfMonth(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
  });
  const defaultMonthResolved = useRef(false);
  const { data: latestIncompleteMonth } = useLatestIncompleteCockpitMonth();

  useEffect(() => {
    if (latestIncompleteMonth && !defaultMonthResolved.current) {
      setMonth(latestIncompleteMonth);
      defaultMonthResolved.current = true;
    }
  }, [latestIncompleteMonth]);

  const [ackStep, setAckStep] = useState<CockpitStep | null>(null);
  const [ackNotes, setAckNotes] = useState("");
  const [closeOpen, setCloseOpen] = useState(false);
  const [tool, setTool] = useState<CockpitToolKey | null>(null);
  const [toolStep, setToolStep] = useState<{ no: number; label: string } | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());

  const [, setSearchParams] = useSearchParams();
  const qc = useQueryClient();


  // Embedded tools read the URL (tab / focus / period), so the cockpit sets them before opening.
  function openTool(
    key: CockpitToolKey,
    params?: Record<string, string>,
    step?: { no: number; label: string },
  ) {
    const next = new URLSearchParams(params ?? {});
    next.set("period", month.slice(0, 7));
    setSearchParams(next, { replace: true });
    setToolStep(step ?? null);
    setTool(key);
  }
  function closeTool() {
    setTool(null);
    setToolStep(null);
    setSearchParams(new URLSearchParams(), { replace: true });
    // A tool may have changed revisions / inputs / recoveries — re-evaluate the
    // live step status and the step-5 gate instead of serving the 30s cache.
    qc.invalidateQueries({ queryKey: ["hr_cockpit_month_state"] });
    qc.invalidateQueries({ queryKey: ["gate_lop"] });
    qc.invalidateQueries({ queryKey: ["gate_auto_recoveries"] });
    // Mandatory recalculations (LOP / comp-off encashment) may now be staged.
    qc.invalidateQueries({ queryKey: ["recalc_gate_lop"] });
    qc.invalidateQueries({ queryKey: ["recalc_gate_compoff"] });
  }

  const monthDate = useMemo(() => new Date(month + "T00:00:00Z"), [month]);
  const monthLabel = monthDate.toLocaleString("en-IN", { month: "long", year: "numeric" });
  const opts = useMemo(() => monthOptions(), []);

  const { data: steps = [], isLoading, error } = useCockpitMonth(month);
  const stepGate = usePayrollStepGate(month);
  const recalc = useMandatoryRecalcs(month);

  /** Recalculations that MUST have been run and staged before a step is confirmed. */
  function recalcReasonsFor(stepKey: string): string[] {
    if (stepKey === "lop_push") return recalc.lopReasons;
    if (stepKey === "inputs_push") return recalc.compoffReasons;
    return [];
  }
  const ack = useAckCockpitStep(month);
  const close = useCloseMonth(month);

  // The close step is identified by key, never by number — the step list was
  // renumbered when Separations & F&F was inserted.
  const isCloseStep = (s: CockpitStep) => s.step_key === "close_month";

  const doneCount = steps.filter(
    (s) => s.ack_status === "done" || (s.live_status === "complete" && s.auto && !isCloseStep(s))
  ).length;
  const blockers = steps
    .filter((s) => !isCloseStep(s) && s.ack_status !== "done" && s.ack_status !== "skipped" && s.live_status !== "complete")
    .map((s) => `Step ${s.step_no}: ${s.step_label}`);

  const closed = steps.find(isCloseStep)?.ack_status === "done";

  const isSettled = (s: CockpitStep) =>
    s.ack_status === "done" ||
    s.ack_status === "skipped" ||
    (s.auto && s.live_status === "complete" && !isCloseStep(s));

  // The first step that still needs a human — used as the "you are here" anchor.
  const currentStep = steps.find((s) => !isSettled(s) && !isCloseStep(s)) ?? null;


  const stageSummary = STAGE_ORDER.map((stage) => {
    const inStage = steps.filter((s) => STEP_STAGE[s.step_key] === stage);
    return {
      stage,
      total: inStage.length,
      done: inStage.filter(isSettled).length,
      firstNo: inStage[0]?.step_no ?? 0,
    };
  }).filter((s) => s.total > 0);

  const pct = steps.length ? Math.round((doneCount / steps.length) * 100) : 0;

  function toggleExpanded(no: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(no) ? next.delete(no) : next.add(no);
      return next;
    });
  }

  function scrollToStep(no: number) {
    document.getElementById(`cockpit-step-${no}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div className="hrms-page space-y-4 p-3 md:p-6 page-mount">
      <PageHeader
        title="Monthly Payroll Cockpit"
      />

      {/* Command bar — month, progress rail, close-month */}
      <Card className="border-primary/30 sticky top-0 z-20 backdrop-blur supports-[backdrop-filter]:bg-card/85">
        <CardContent className="p-3 md:p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Cycle month</span>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="h-9 w-[190px] text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {opts.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="text-sm text-muted-foreground">
              <span className="t-mono font-semibold text-foreground">{doneCount}/{steps.length || 10}</span> steps complete
            </div>

            {currentStep && !closed && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-primary"
                onClick={() => scrollToStep(currentStep.step_no)}
              >
                You are here · Step {currentStep.step_no} <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            )}

            <div className="ml-auto flex items-center gap-2">
              {closed ? (
                <Badge className="bg-success/15 text-success border-success/30 gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Month closed
                </Badge>
              ) : (
                <Button
                  onClick={() => setCloseOpen(true)}
                  disabled={close.isPending}
                  variant={blockers.length > 0 ? "outline" : "default"}
                  className="gap-1.5 w-full sm:w-auto"
                >
                  <Flag className="h-4 w-4" />
                  {blockers.length > 0 ? `Close month (${blockers.length} blockers)` : "Close month"}
                </Button>
              )}
            </div>
          </div>

          {/* Stage rail */}
          <div className="space-y-1.5">
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {stageSummary.map((s) => {
                const complete = s.done === s.total;
                return (
                  <button
                    key={s.stage}
                    type="button"
                    onClick={() => scrollToStep(s.firstNo)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                      complete
                        ? "border-success/30 bg-success/10 text-success"
                        : "border-border bg-muted/40 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {complete ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                    {s.stage}
                    <span className="t-mono">{s.done}/{s.total}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {blockers.length > 0 && !closed && (
            <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-warning">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {blockers.length} {plural(blockers.length, "step")} still blocking month close
              </div>
              <ul className="mt-1 grid gap-0.5 sm:grid-cols-2 xl:grid-cols-3">
                {blockers.map((b) => (
                  <li key={b} className="text-xs text-muted-foreground truncate">{b}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payroll toolbox — every sub-tool opens inside the cockpit, not the sidebar. */}
      <Card>
        <CardContent className="p-3 md:p-4 grid gap-3 lg:grid-cols-2">
          {[
            { title: "Routine tools", items: ROUTINE_TOOLS },
            { title: "Diagnostics", items: DIAGNOSTIC_TOOLS },
          ].map((group) => (
            <div key={group.title}>
              <div className="t-eyebrow text-[10px] uppercase tracking-wide text-muted-foreground mb-2">{group.title}</div>
              <div className="flex flex-wrap gap-2">
                {group.items.map((t) => (
                  <Button
                    key={t.tool + t.label}
                    variant="secondary"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => openTool(t.tool)}
                  >
                    <t.icon className="h-3.5 w-3.5" />
                    {t.label}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {error ? (
        <Card className="border-destructive/40">
          <CardContent className="p-6 text-sm text-destructive">
            Could not load cockpit steps: {(error as any)?.message || "unknown error"}
          </CardContent>
        </Card>
      ) : isLoading ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading cockpit…</CardContent></Card>
      ) : (

        <div className="space-y-2.5">
          {steps.map((step) => {
            const Icon = STEP_ICONS[step.step_key] ?? Circle;
            const target = STEP_TARGET[step.step_key];
            // Mandatory recalculations (LOP, comp-off encashment) must be run
            // and staged before their step can be confirmed.
            const stepRecalcReasons = step.ack_status === "done" ? [] : recalcReasonsFor(step.step_key);
            // Step 5 stays sealed until step 4 is genuinely finished.
            const gated =
              step.ack_status !== "done" &&
              ((step.step_key === "inputs_push" && stepGate.blocked) || stepRecalcReasons.length > 0);
            const canAck =
              !isCloseStep(step) &&
              !gated &&
              (step.live_status === "complete" || step.step_key === "run_on_razorpay");
            // Steps stay skippable per the close-month policy: a step the system
            // still reports as pending can be confirmed deliberately with a note.
            // A missing mandatory recalculation is NOT skippable.
            const canAckAnyway = !isCloseStep(step) && !gated && !canAck;



            const settled = isSettled(step);
            const isCurrent = currentStep?.step_no === step.step_no;
            const open = expanded.has(step.step_no) || !settled;

            return (
              <Card
                key={step.step_no}
                id={`cockpit-step-${step.step_no}`}
                className={`scroll-mt-28 transition-colors ${
                  gated || step.ack_status === "blocked"
                    ? "border-destructive/30"
                    : settled
                    ? "border-success/25 bg-success/[0.02]"
                    : isCurrent
                    ? "border-primary/50 shadow-brand"
                    : "border-info/25"
                }`}
              >
                {/* Collapsed summary row for settled steps */}
                {!open ? (
                  <button
                    type="button"
                    onClick={() => toggleExpanded(step.step_no)}
                    className="w-full text-left px-3 py-2.5 md:px-4 flex items-center gap-3 hover:bg-muted/40 rounded-[inherit]"
                  >
                    <StepIcon step={step} />
                    <span className="t-mono text-[11px] text-muted-foreground shrink-0">Step {step.step_no}</span>
                    <span className="font-medium truncate">{step.step_label}</span>
                    <span className="hidden md:block text-xs text-muted-foreground truncate flex-1">
                      <DetailLine step={step} />
                    </span>
                    <span className="ml-auto flex items-center gap-2 shrink-0">
                      <AckChip step={step} />
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    </span>
                  </button>
                ) : (
                  <CardContent className="p-3 md:p-5">
                    <div className="flex flex-col gap-3 xl:flex-row xl:gap-6">
                      {/* Identity */}
                      <div className="flex items-start gap-3 xl:w-[300px] xl:shrink-0">
                        <div className="mt-0.5"><StepIcon step={step} /></div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="t-mono text-[11px] text-muted-foreground">Step {step.step_no}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase tracking-wide inline-flex items-center gap-1">
                              {step.auto ? <Bot className="h-3 w-3" /> : <UserCheck className="h-3 w-3" />}
                              {step.actor_hint}
                            </span>
                            {isCurrent && (
                              <Badge className="bg-primary/15 text-primary border-primary/30">Current</Badge>
                            )}
                          </div>
                          <div className="mt-1 flex items-start gap-2 font-semibold text-foreground">
                            <Icon className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                            <span className="leading-snug">{step.step_label}</span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <LiveChip step={step} />
                            <AckChip step={step} />
                          </div>
                        </div>
                      </div>

                      {/* Detail */}
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="text-sm text-muted-foreground">
                          <DetailLine step={step} />
                        </div>
                        {step.ack_notes && (
                          <div className="text-xs italic text-muted-foreground border-l-2 border-primary/30 pl-2">
                            Note: {step.ack_notes}
                          </div>
                        )}
                        {step.ack_at && (
                          <div className="text-xs text-success flex items-center gap-1">
                            <Clock className="h-3 w-3 shrink-0" />
                            Acknowledged {new Date(step.ack_at).toLocaleString("en-IN")}
                          </div>
                        )}
                        {gated && (
                          <div className="rounded-md border border-warning/30 bg-warning/5 px-2.5 py-2">
                            <div className="flex items-center gap-1.5 text-xs font-medium text-warning">
                              <Lock className="h-3 w-3 shrink-0" /> This step cannot be confirmed yet
                            </div>
                            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                              {stepRecalcReasons.map((r) => (
                                <li key={r}>{r}. Open the tool, run the calculation and stage the rows.</li>
                              ))}
                              {step.step_key === "inputs_push" &&
                                stepGate.lopReasons.map((r) => <li key={r}>Pending in Step 4: {r}.</li>)}
                              {step.step_key === "inputs_push" &&
                                stepGate.recoveryReasons.map((r) => (
                                  <li key={r}>{r}. Open the tool to push {stepGate.recPending === 1 ? "it" : "them"}.</li>
                                ))}
                            </ul>
                          </div>
                        )}

                      </div>

                      {/* Actions */}
                      <div className="flex flex-col gap-2 xl:w-[220px] xl:shrink-0 xl:items-stretch">
                        {target && "tool" in target && (
                          <Button
                            variant="outline"
                            className="h-10 w-full justify-between gap-1.5"
                            onClick={() =>
                              openTool(target.tool, target.params, {
                                no: step.step_no,
                                label: step.step_label,
                              })
                            }
                          >
                            {target.label} <ChevronRight className="h-3.5 w-3.5" />
                          </Button>
                        )}

                        {target && "href" in target && (
                          <Button variant="outline" asChild className="h-10 w-full justify-between gap-1.5">
                            <a href={target.href} target="_blank" rel="noreferrer">
                              {target.label} <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </Button>
                        )}
                        {step.step_key === "run_on_razorpay" && (
                          <Button
                            variant="outline"
                            className="h-10 w-full justify-between gap-1.5"
                            onClick={() => setPackOpen(true)}
                          >
                            Download verification pack <FileSpreadsheet className="h-3.5 w-3.5" />
                          </Button>
                        )}

                        {canAck && step.ack_status !== "done" && !closed && (
                          <Button
                            className="h-10 w-full gap-1.5"
                            onClick={() => {
                              setAckStep(step);
                              setAckNotes(step.ack_notes ?? "");
                            }}
                          >
                            <CheckCircle2 className="h-4 w-4" /> Mark done
                          </Button>
                        )}
                        {canAckAnyway && step.ack_status !== "done" && !closed && (
                          <Button
                            variant="outline"
                            className="h-10 w-full gap-1.5"
                            title="The system still reports work pending on this step — confirm only if it is deliberate."
                            onClick={() => {
                              setAckStep(step);
                              setAckNotes(step.ack_notes ?? "");
                            }}
                          >
                            <CheckCircle2 className="h-4 w-4" /> Confirm anyway
                          </Button>
                        )}
                        {stepRecalcReasons.length > 0 && !closed && (
                          <Button
                            variant="outline"
                            className="h-10 w-full gap-1.5 border-warning/40 text-warning hover:text-warning"
                            onClick={() =>
                              toast.error("This step cannot be confirmed yet", {
                                description: `${stepRecalcReasons.join(". ")}. Run the calculation and stage the rows first.`,
                              })
                            }
                          >
                            <Lock className="h-4 w-4" /> Mark done
                          </Button>
                        )}

                        {step.ack_status === "done" && !closed && !isCloseStep(step) && (

                          <Button
                            variant="ghost"
                            className="h-10 w-full"
                            onClick={() => ack.mutate({ step_no: step.step_no, status: "pending" })}
                          >
                            Undo
                          </Button>
                        )}
                        {settled && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full gap-1 text-muted-foreground"
                            onClick={() => toggleExpanded(step.step_no)}
                          >
                            <ChevronUp className="h-3.5 w-3.5" /> Collapse
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}


      {/* Acknowledge dialog */}
      <AlertDialog open={!!ackStep} onOpenChange={(o) => !o && setAckStep(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Acknowledge — Step {ackStep?.step_no}: {ackStep?.step_label}
            </AlertDialogTitle>
            <AlertDialogDescription>
              This records you as having completed this step for {monthLabel}. A short note is optional but recommended.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={ackNotes}
            onChange={(e) => setAckNotes(e.target.value)}
            placeholder="e.g. Ran payroll #237 on RazorpayX at 4pm."
            rows={3}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!ackStep) return;
                const blocking = recalcReasonsFor(ackStep.step_key);
                if (blocking.length) {
                  toast.error("This step cannot be confirmed yet", {
                    description: `${blocking.join(". ")}. Run the calculation and stage the rows first.`,
                  });
                  return;
                }
                ack.mutate(
                  { step_no: ackStep.step_no, status: "done", notes: ackNotes || undefined },
                  { onSuccess: () => setAckStep(null) }
                );
              }}
            >
              Mark done
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Close month dialog */}
      <AlertDialog open={closeOpen} onOpenChange={setCloseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close {monthLabel}?</AlertDialogTitle>
            <AlertDialogDescription>
              {blockers.length === 0 ? (
                <>All prior steps are complete. Closing freezes acknowledgements for this month.</>
              ) : (
                <>
                  <div className="mb-2 text-destructive">Cannot close — resolve first:</div>
                  <ul className="list-disc pl-5 text-sm space-y-1">
                    {blockers.map((b) => <li key={b}>{b}</li>)}
                  </ul>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={blockers.length > 0}
              onClick={() => {
                close.mutate(undefined, { onSuccess: () => setCloseOpen(false) });
              }}
            >
              Close month
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CockpitToolSheet
        tool={tool}
        month={month}
        stepNo={toolStep?.no}
        stepLabel={toolStep?.label}
        onClose={closeTool}
      />
    </div>
  );
}
