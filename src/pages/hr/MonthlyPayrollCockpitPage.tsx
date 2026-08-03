import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CockpitToolSheet, type CockpitToolKey } from "@/components/hrms/CockpitToolSheet";
import {
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  ChevronRight,
  Lock,
  Activity,
  TrendingUp,
  Upload,
  FileText,
  Calculator,
  Scale,
  Flag,
  ExternalLink,
  UserCheck,
  Bot,
} from "lucide-react";
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

const STEP_ICONS: Record<string, any> = {
  lock_attendance: Lock,
  watchdog_zero: Activity,
  salary_revisions: Scale,
  lop_push: TrendingUp,
  inputs_push: Upload,
  run_on_razorpay: ExternalLink,
  import_payslips: FileText,
  shadow_compare: Calculator,
  drift_review: Scale,
  close_month: Flag,
};

type StepTarget =
  | { tool: CockpitToolKey; label: string; params?: Record<string, string> }
  | { href: string; label: string };

const STEP_TARGET: Record<string, StepTarget> = {
  lock_attendance: { tool: "period_locks", label: "Open Period Locks" },
  watchdog_zero: { tool: "stale_sessions", label: "Open Stale Sessions" },
  salary_revisions: { href: "/hrms/payroll/salary-revisions", label: "Open Salary Revisions" },
  lop_push: { tool: "inputs", label: "Open LOP deductions", params: { tab: "deduction", focus: "lop" } },
  inputs_push: { tool: "inputs", label: "Open additions / deductions", params: { tab: "addition" } },
  run_on_razorpay: { href: "https://x.razorpay.com/payroll/runs", label: "Open RazorpayX Dashboard" },
  import_payslips: { tool: "payslip_emails", label: "Import & email payslips" },
  shadow_compare: { tool: "shadow", label: "Run Shadow Payroll" },
  drift_review: { tool: "data_health", label: "Open Data Health" },
};


const EXTRA_TOOLS: { tool: CockpitToolKey; label: string }[] = [
  { tool: "inputs", label: "Payroll Inputs" },
  { tool: "salary_register", label: "Import Salary Register" },
  { tool: "payslip_import", label: "Import Payslips" },
  { tool: "payslip_emails", label: "Payslip Email Dispatch" },
  { tool: "shadow", label: "Shadow Payroll" },
  { tool: "razorpay_sync", label: "RazorpayX Diagnostics" },
  { tool: "system_pulse", label: "System Pulse" },
  { tool: "data_health", label: "Data Health" },
];

function monthOptions(): { value: string; label: string }[] {
  const opts: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = -1; i <= 6; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    opts.push({
      value: firstOfMonth(d),
      label: d.toLocaleString("en-IN", { month: "long", year: "numeric" }),
    });
  }
  return opts;
}

function StepBadge({ step }: { step: CockpitStep }) {
  if (step.ack_status === "done")
    return <Badge className="bg-emerald-600/15 text-emerald-500 border-emerald-600/30">Done</Badge>;
  if (step.ack_status === "skipped")
    return <Badge variant="outline">Skipped</Badge>;
  if (step.ack_status === "blocked")
    return <Badge variant="destructive">Blocked</Badge>;
  if (step.live_status === "complete" && step.auto)
    return <Badge className="bg-emerald-600/15 text-emerald-500 border-emerald-600/30">Auto ✓</Badge>;
  if (step.live_status === "complete")
    return <Badge className="bg-blue-500/15 text-blue-500 border-blue-500/30">Ready to acknowledge</Badge>;
  return <Badge variant="outline" className="text-muted-foreground">Pending</Badge>;
}

function StepIcon({ step }: { step: CockpitStep }) {
  if (step.ack_status === "done")
    return <CheckCircle2 className="h-6 w-6 text-emerald-500" />;
  if (step.ack_status === "blocked")
    return <AlertTriangle className="h-6 w-6 text-destructive" />;
  if (step.live_status === "complete")
    return <CheckCircle2 className="h-6 w-6 text-blue-500" />;
  return <Circle className="h-6 w-6 text-muted-foreground" />;
}

function DetailLine({ step }: { step: CockpitStep }) {
  const d = step.live_detail ?? {};
  switch (step.step_key) {
    case "lock_attendance":
      if (d.has_system_lock) {
        const when = d.latest_locked_at ? new Date(d.latest_locked_at).toLocaleDateString("en-IN") : "—";
        return <span>Auto-locked by system on {when} (grace 2d after month end).</span>;
      }
      return <span>{d.locked_ranges ?? 0} attendance period(s) locked overlapping this month.</span>;
    case "watchdog_zero":
      return <span>{d.stale_open ?? 0} stale sessions open for this month.</span>;
    case "salary_revisions":
      return (
        <span>
          {d.rev_rows ?? 0} revision(s) effective / payable this month
          {(d.rev_pending ?? 0) > 0
            ? ` · ${d.rev_pending} still pending or scheduled — finalise before LOP is calculated`
            : " · none pending"}
          {Number(d.one_time_total ?? 0) > 0
            ? ` · one-time arrears ₹${Number(d.one_time_total).toLocaleString("en-IN")}`
            : ""}
          .
        </span>
      );
    case "lop_push":
      return (
        <span>
          {d.lop_rows ?? 0} LOP row(s) staged
          {(d.auto_rows ?? 0) > 0 ? ` · ${d.auto_rows} auto-calculated from attendance (${Number(d.auto_lop_days ?? 0)} LOP days)` : " · none auto-calculated yet"}
          {" · "}
          <strong>{d.verified_rows ?? 0}/{d.lop_rows ?? 0} verified in RazorpayX</strong>
          {(d.pushed_rows ?? 0) > (d.verified_rows ?? 0)
            ? ` (${(d.pushed_rows ?? 0) - (d.verified_rows ?? 0)} pushed but not read back)`
            : ""}
          .
        </span>
      );
    case "inputs_push":
      return (
        <span>
          {d.input_rows ?? 0} additions/deductions staged · <strong>{d.input_verified ?? 0}/{d.input_rows ?? 0} verified in RazorpayX</strong>
          {(d.rec_rows ?? 0) > 0
            ? ` · ${d.rec_rows} automatic recovery installment(s) (loan EMI / deposit / error recovery) worth ₹${Number(d.rec_amount ?? 0).toLocaleString("en-IN")} — ${d.rec_pushed ?? 0} pushed${(d.rec_failed ?? 0) > 0 ? `, ${d.rec_failed} failed` : ""}`
            : " · no automatic recoveries due this month"}
          .
        </span>
      );

    case "run_on_razorpay":
      return (
        <span className="text-amber-500">
          RazorpayX API cannot confirm a payroll run — mark done here after running it on the dashboard.
          {d.processed_on ? ` Credit date recorded: ${new Date(String(d.processed_on)).toLocaleDateString("en-IN")}.` : ""}
        </span>
      );
    case "import_payslips":
      return (
        <span>
          {d.imported ?? 0} payslip(s) imported · {d.register_rows ?? 0} register row(s) uploaded ·{" "}
          {d.with_pdf ?? 0} payslip PDF(s) attached ·{" "}
          <strong>{d.emails_sent ?? 0}/{d.payable ?? 0} payslip emails sent</strong>
          {(d.register_rows ?? 0) === 0 ? " — register CSV required before emails can be sent" : ""}.
        </span>
      );
    case "shadow_compare":
      return d.run_id ? (
        <span>Shadow run: <code className="text-xs">{String(d.run_id).slice(0, 8)}</code> · {d.status || "—"}</span>
      ) : (
        <span>No shadow run for this month yet.</span>
      );
    case "drift_review":
      return (
        <span>
          {d.drift_open ?? 0} <strong>unexplained</strong> drift alert(s) for this month.{" "}
          <span className="text-muted-foreground text-xs">(±₹5 & TDS rounding auto-tolerated)</span>
        </span>
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
  const [ackStep, setAckStep] = useState<CockpitStep | null>(null);
  const [ackNotes, setAckNotes] = useState("");
  const [closeOpen, setCloseOpen] = useState(false);
  const [tool, setTool] = useState<CockpitToolKey | null>(null);
  const [, setSearchParams] = useSearchParams();

  // Embedded tools read the URL (tab / focus / period), so the cockpit sets them before opening.
  function openTool(key: CockpitToolKey, params?: Record<string, string>) {
    const next = new URLSearchParams(params ?? {});
    next.set("period", month.slice(0, 7));
    setSearchParams(next, { replace: true });
    setTool(key);
  }
  function closeTool() {
    setTool(null);
    setSearchParams(new URLSearchParams(), { replace: true });
  }

  const monthDate = useMemo(() => new Date(month + "T00:00:00Z"), [month]);
  const monthLabel = monthDate.toLocaleString("en-IN", { month: "long", year: "numeric" });
  const opts = useMemo(() => monthOptions(), []);

  const { data: steps = [], isLoading, error } = useCockpitMonth(month);
  const ack = useAckCockpitStep(month);
  const close = useCloseMonth(month);

  const doneCount = steps.filter(
    (s) => s.ack_status === "done" || (s.live_status === "complete" && s.auto && s.step_no !== 10)
  ).length;
  const blockers = steps
    .filter((s) => s.step_no <= 8 && s.ack_status !== "done" && s.ack_status !== "skipped" && s.live_status !== "complete")
    .map((s) => `Step ${s.step_no}: ${s.step_label}`);

  const closed = steps.find((s) => s.step_no === 10)?.ack_status === "done";

  return (
    <div className="hrms-page space-y-4 p-3 md:p-6 page-mount">
      <PageHeader
        title="Monthly Payroll Cockpit"
        description="The month-end ritual as a machine. Nine deterministic steps."
      />

      <Card className="border-primary/30">
        <CardContent className="p-4 md:p-5 flex flex-wrap items-center gap-3 md:gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Cycle month</span>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="h-9 w-[220px]">
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
            <span className="font-medium text-foreground">{doneCount}/9</span> steps complete for{" "}
            <span className="font-medium text-foreground">{monthLabel}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {closed ? (
              <Badge className="bg-emerald-600/15 text-emerald-500 border-emerald-600/30 gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Month closed
              </Badge>
            ) : (
              <Button
                onClick={() => setCloseOpen(true)}
                disabled={close.isPending}
                variant={blockers.length > 0 ? "outline" : "default"}
                className="gap-1.5"
              >
                <Flag className="h-4 w-4" />
                {blockers.length > 0 ? `Close month (${blockers.length} blockers)` : "Close month"}
              </Button>

            )}
          </div>
        </CardContent>
      </Card>

      {/* Payroll toolbox — every sub-tool opens inside the cockpit, not the sidebar. */}
      <Card>
        <CardContent className="p-3 md:p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Payroll toolbox</div>
          <div className="flex flex-wrap gap-2">
            {EXTRA_TOOLS.map((t) => (
              <Button
                key={t.tool + t.label}
                variant="secondary"
                size="sm"
                className="gap-1.5"
                onClick={() => openTool(t.tool)}
              >
                {t.label}
              </Button>
            ))}
          </div>
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

        <div className="space-y-3">
          {steps.map((step) => {
            const Icon = STEP_ICONS[step.step_key] ?? Circle;
            const target = STEP_TARGET[step.step_key];
            const canAck = step.step_no !== 10 && (step.live_status === "complete" || step.step_key === "run_on_razorpay");

            return (
              <Card
                key={step.step_no}
                className={
                  step.ack_status === "done"
                    ? "border-emerald-600/30 bg-emerald-500/[0.02]"
                    : step.live_status === "complete"
                    ? "border-blue-500/30"
                    : ""
                }
              >
                <CardContent className="p-4 md:p-5">
                  <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex items-start gap-3 md:min-w-[280px]">
                      <div className="mt-0.5">
                        <StepIcon step={step} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono text-muted-foreground">Step {step.step_no}</span>
                          <StepBadge step={step} />
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                            {step.auto ? <Bot className="h-3 w-3" /> : <UserCheck className="h-3 w-3" />}
                            {step.actor_hint}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2 font-semibold text-foreground">
                          <Icon className="h-4 w-4 text-primary" />
                          {step.step_label}
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 space-y-2">
                      <div className="text-sm text-muted-foreground">
                        <DetailLine step={step} />
                      </div>
                      {step.ack_notes && (
                        <div className="text-xs italic text-muted-foreground border-l-2 border-primary/30 pl-2">
                          Note: {step.ack_notes}
                        </div>
                      )}
                      {step.ack_at && (
                        <div className="text-xs text-emerald-500 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Acknowledged {new Date(step.ack_at).toLocaleString("en-IN")}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 md:min-w-[200px] md:items-end">
                      {target && "tool" in target && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => openTool(target.tool, target.params)}
                        >
                          {target.label} <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {target && "href" in target && (
                        <Button variant="outline" size="sm" asChild className="gap-1.5">
                          <a href={target.href} target="_blank" rel="noreferrer">
                            {target.label} <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      )}
                      {canAck && step.ack_status !== "done" && !closed && (
                        <Button
                          size="sm"
                          onClick={() => {
                            setAckStep(step);
                            setAckNotes(step.ack_notes ?? "");
                          }}
                          className="gap-1.5"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Mark done
                        </Button>
                      )}
                      {step.ack_status === "done" && !closed && step.step_no !== 10 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => ack.mutate({ step_no: step.step_no, status: "pending" })}
                        >
                          Undo
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
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

      <CockpitToolSheet tool={tool} onClose={closeTool} />
    </div>
  );
}
