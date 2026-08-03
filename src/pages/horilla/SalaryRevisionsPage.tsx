import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { TrendingUp, TrendingDown, Search, Plus, X, Clock, AlertTriangle, Send, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { ReviseSalaryDialog } from "@/components/hrms/ReviseSalaryDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { pushSalaryToRazorpay } from "@/lib/razorpayPushback";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type StatusFilter = "APPLIED" | "SCHEDULED" | "CANCELLED" | "ALL";

export default function SalaryRevisionsPage({ month }: { month?: string } = {}) {
  const qc = useQueryClient();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission("hrms_manage");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("APPLIED");
  const [showDialog, setShowDialog] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [pushingIds, setPushingIds] = useState<Set<string>>(new Set());

  const { data: revisions = [], isLoading } = useQuery({
    queryKey: ["hr_salary_revisions"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_salary_revisions")
        .select("*, hr_employees!hr_salary_revisions_employee_id_fkey(first_name, last_name, badge_id)")
        .neq("status", "NOOP")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Envelope verification status — governs whether pushes to Razorpay can succeed.
  const { data: envelope } = useQuery({
    queryKey: ["hr_razorpay_settings_envelope"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("hr_razorpay_settings")
        .select("last_creds_validated_at, push_salary_endpoint_verified, push_salary_envelope_key, push_salary_envelope_verified_at, push_payroll_endpoint_verified")
        .maybeSingle();
      return data as {
        last_creds_validated_at?: string | null;
        push_salary_endpoint_verified?: boolean;
        push_salary_envelope_key?: string | null;
        push_salary_envelope_verified_at?: string | null;
        push_payroll_endpoint_verified?: boolean;
      } | null;
    },
    staleTime: 30_000,
  });

  // ALL recent salary push logs per employee (not just the newest).
  // We correlate a specific revision's CTC to its own push log below, so a
  // later unrelated failure (e.g. an "Expected CTC 0" stray click) does NOT
  // downgrade the badge of an earlier successful revision.
  const { data: pushLogsByEmployee = {} as Record<string, Array<{ status: string; created_at: string; error_message: string | null; response_snapshot: any }>> } = useQuery({
    queryKey: ["hr_salary_push_latest"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_razorpay_pushback_log")
        .select("hr_employee_id, status, created_at, error_message, response_snapshot")
        .eq("kind", "salary")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      const map: Record<string, Array<any>> = {};
      for (const r of (data || [])) {
        (map[r.hr_employee_id] ||= []).push(r);
      }
      return map;
    },
    staleTime: 15_000,
  });


  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).rpc("cancel_scheduled_salary_revision", {
        p_revision_id: id,
        p_reason: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_salary_revisions"] });
      toast.success("Scheduled revision cancelled");
      setCancelId(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const ONE_TIME_KINDS = new Set(["bonus", "performance_incentive", "retention_bonus", "special_allowance", "ad_hoc"]);
  const filtered = useMemo(() => revisions.filter((r: any) => {
    const isOneTime = ONE_TIME_KINDS.has(r.revision_type) || Number(r.one_time_amount || 0) > 0;
    // Exclude initial onboarding entries (no prior salary → not a revision),
    // but always keep one-time payouts (bonus/incentive/etc.) which have no previous_total.
    if (!isOneTime && Number(r.previous_total || 0) <= 0) return false;
    if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
    const name = `${r.hr_employees?.first_name || ""} ${r.hr_employees?.last_name || ""}`.toLowerCase();
    return name.includes(search.toLowerCase());
  }), [revisions, statusFilter, search]);

  // Revisions that land in THIS payroll month for the first time:
  //  · CTC revisions whose effective_from falls inside the month
  //  · one-time payouts targeted at this payroll month
  const monthScoped = useMemo(() => {
    if (!month) return [] as any[];
    const start = new Date(`${month.slice(0, 7)}-01T00:00:00Z`);
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    const inMonth = (v?: string | null) => {
      if (!v) return false;
      const d = new Date(v);
      return !isNaN(d.getTime()) && d >= start && d < end;
    };
    return revisions.filter((r: any) => {
      if (r.status === "CANCELLED") return false;
      const isOneTime = ONE_TIME_KINDS.has(r.revision_type) || Number(r.one_time_amount || 0) > 0;
      return isOneTime ? inMonth(r.payout_month) : inMonth(r.effective_from);
    });
  }, [revisions, month]);

  const monthLabel = month ? format(new Date(`${month.slice(0, 7)}-01T00:00:00Z`), "MMMM yyyy") : "";

  const envelopeVerified = !!envelope?.push_salary_endpoint_verified;
  const payrollGateVerified = !!envelope?.push_payroll_endpoint_verified;

  useEffect(() => {
    if (!canManage || !envelope?.last_creds_validated_at || payrollGateVerified) return;
    let cancelled = false;
    (async () => {
      const { error } = await supabase.functions.invoke("razorpay-payroll-proxy", {
        body: { action: "auto_verify_step_envelopes" },
      });
      if (!cancelled && !error) {
        await qc.invalidateQueries({ queryKey: ["hr_razorpay_settings_envelope"] });
      }
    })();
    return () => { cancelled = true; };
  }, [canManage, envelope?.last_creds_validated_at, payrollGateVerified, qc]);

  const isPayrollGateError = (message: unknown) =>
    typeof message === "string" && /payroll-write gate|push_payroll_endpoint_verified=false/i.test(message);


  function getRazorpayCtcPushState(
    logs: Array<{ status: string; created_at: string; error_message: string | null; response_snapshot: any }> | undefined,
    expectedTotal: number,
    revisionCreatedAt: string,
  ): { state: "verified" | "failed" | "none"; log?: any } {
    if (!logs || logs.length === 0 || !Number.isFinite(expectedTotal) || expectedTotal <= 0) return { state: "none" };
    // 1) Verified success for THIS revision's CTC (any time).
    //    RazorpayX does NOT expose annual CTC via its read API until the first
    //    payroll run, so `actual` is legitimately null on a verified push. In
    //    that case we match on the `expected` value instead of `actual`.
    for (const l of logs) {
      if (l.status !== "success") continue;
      const snapshot = l.response_snapshot || {};
      const verify = snapshot.verify || snapshot;
      if (!Array.isArray(verify?.fields)) continue;
      if (verify?.overall !== "verified") continue;
      const ctcField = verify.fields.find((f: any) => f?.key === "annual_ctc");
      if (ctcField?.match !== true) continue;
      const actual = Number(ctcField?.actual);
      const expected = Number(ctcField?.expected);
      const actualMatches = Number.isFinite(actual) && Math.abs(actual - expectedTotal) <= 1;
      const expectedMatches =
        (ctcField?.actual === null || ctcField?.actual === undefined) &&
        Number.isFinite(expected) &&
        Math.abs(expected - expectedTotal) <= 1;
      if (actualMatches || expectedMatches) {
        return { state: "verified", log: l };
      }
    }

    // 2) Failure that specifically targeted THIS CTC (expected matches new_total) AFTER the revision.
    for (const l of logs) {
      if (l.status !== "failure") continue;
      if (l.created_at < revisionCreatedAt) continue;
      const snapshot = l.response_snapshot || {};
      const verify = snapshot.verify || snapshot;
      const fields = Array.isArray(verify?.fields) ? verify.fields : [];
      const ctcField = fields.find((f: any) => f?.key === "annual_ctc");
      const expected = Number(ctcField?.expected);
      if (Number.isFinite(expected) && Math.abs(expected - expectedTotal) <= 1) {
        return { state: "failed", log: l };
      }
    }
    // Otherwise: this revision has never been pushed (or only unrelated pushes exist).
    return { state: "none" };
  }


  async function pushOne(employeeId: string, revisionId: string, expectedTotal: number) {
    if (!Number.isFinite(expectedTotal) || expectedTotal <= 0) {
      toast.error("This entry has no CTC change — nothing to push to RazorpayX.");
      return;
    }
    setPushingIds(prev => new Set(prev).add(revisionId));
    try {
      const res = await pushSalaryToRazorpay(employeeId, {
        triggeredFrom: "salary_revisions_row",
        silent: true,
        expectedTotal,
      });
      if (res.ok && typeof res.verifiedTotal === "number" && Math.abs(res.verifiedTotal - expectedTotal) <= 1) {
        toast.success(`Verified in RazorpayX: ₹${res.verifiedTotal.toLocaleString("en-IN")}`);
      } else if (res.skipped) {
        toast.warning("Employee is not linked to RazorpayX — link them from Data Health first.");
      } else {
        toast.error("RazorpayX push NOT verified — revision not finalized.", {
          description: (res.error || "CTC mismatch or push rejected").slice(0, 220),
        });
      }
      await qc.invalidateQueries({ queryKey: ["hr_salary_push_latest"] });
    } finally {
      setPushingIds(prev => { const n = new Set(prev); n.delete(revisionId); return n; });
    }
  }

  async function pushOneTime(revisionId: string) {
    setPushingIds(prev => new Set(prev).add(revisionId));
    try {
      const mod = await import("@/lib/oneTimePayoutPush");
      const res = await mod.pushOneTimePayoutToRazorpay(revisionId);
      if (res.ok) {
        toast.success("Payout queued on RazorpayX for that payroll month.");
      } else if (res.skipped) {
        toast.warning(res.error || "Employee not linked to RazorpayX");
      } else {
        toast.error("RazorpayX rejected the payout.", { description: (res.error || "Unknown error").slice(0, 220) });
      }
      await qc.invalidateQueries({ queryKey: ["hr_salary_revisions"] });
    } finally {
      setPushingIds(prev => { const n = new Set(prev); n.delete(revisionId); return n; });
    }
  }


  const renderRevisionCard = (r: any) => {
            const isOneTime = ONE_TIME_KINDS.has(r.revision_type) || Number(r.one_time_amount || 0) > 0;
            const isIncrease = Number(r.new_total || 0) > Number(r.previous_total || 0);
            const diff = Number(r.new_total || 0) - Number(r.previous_total || 0);
            const isScheduled = r.status === "SCHEDULED";
            const isCancelled = r.status === "CANCELLED";
            const isApplied = r.status === "APPLIED";
            const logs = pushLogsByEmployee[r.employee_id];
            const expectedTotal = Number(r.new_total || 0);
            const pushResult = getRazorpayCtcPushState(logs, expectedTotal, r.created_at);
            const pushInfo = pushResult.log;
            const pushSyncedAfterRevision = pushResult.state === "verified";
            const pushFailedAfterRevision = pushResult.state === "failed";
            const pushing = pushingIds.has(r.id);


            const StatusPill = ({ tone, icon: Icon, label }: { tone: "ok" | "warn" | "bad" | "info"; icon: any; label: string }) => (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      "inline-flex h-6 w-6 items-center justify-center rounded-full border",
                      tone === "ok" && "border-emerald-500/40 text-emerald-600 bg-emerald-500/10",
                      tone === "info" && "border-sky-500/40 text-sky-600 bg-sky-500/10",
                      tone === "warn" && "border-amber-500/40 text-amber-600 bg-amber-500/10",
                      tone === "bad" && "border-destructive/40 text-destructive bg-destructive/10",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-xs text-xs">{label}</TooltipContent>
              </Tooltip>
            );

            let syncBadge: React.ReactNode = null;
            if (isOneTime) {
              const gateOnlyError = isPayrollGateError(r.razorpay_push_error);
              if (gateOnlyError && payrollGateVerified) {
                syncBadge = <StatusPill tone="warn" icon={AlertTriangle} label="Ready to retry the RazorpayX push" />;
              } else if (r.razorpay_push_error) {
                syncBadge = (
                  <StatusPill
                    tone="bad"
                    icon={XCircle}
                    label={`${gateOnlyError ? "Payroll gate locked" : "RazorpayX rejected"}: ${r.razorpay_push_error}`}
                  />
                );
              } else if (r.razorpay_pushed_at) {
                syncBadge = (
                  <StatusPill
                    tone="info"
                    icon={CheckCircle2}
                    label={`Queued in RazorpayX${r.payout_month ? ` · ${format(new Date(r.payout_month), "MMM yyyy")} payroll` : ""}`}
                  />
                );
              } else {
                syncBadge = <StatusPill tone="warn" icon={AlertTriangle} label="Not sent to RazorpayX" />;
              }
            } else if (isApplied) {
              if (pushSyncedAfterRevision) {
                syncBadge = <StatusPill tone="ok" icon={CheckCircle2} label="Synced to RazorpayX" />;
              } else if (pushFailedAfterRevision) {
                syncBadge = (
                  <StatusPill
                    tone="bad"
                    icon={XCircle}
                    label={`Not synced${pushInfo?.error_message ? ` · ${pushInfo.error_message}` : ""}`}
                  />
                );
              } else {
                syncBadge = <StatusPill tone="warn" icon={AlertTriangle} label="Not synced to RazorpayX yet" />;
              }
            }




            // --- Scannable summary line: what actually happened, in words ---
            const typeLabel = isOneTime
              ? String(r.revision_type || "bonus").replace(/_/g, " ").toUpperCase()
              : isScheduled
                ? "SCHEDULED CTC CHANGE"
                : diff >= 0 ? "CTC INCREMENT" : "CTC CORRECTION";

            const typeTone = isCancelled
              ? "border-muted-foreground/30 text-muted-foreground bg-muted"
              : isOneTime
                ? "border-violet-500/40 text-violet-600 bg-violet-500/10"
                : isScheduled
                  ? "border-amber-500/40 text-amber-600 bg-amber-500/10"
                  : diff >= 0
                    ? "border-emerald-500/40 text-emerald-600 bg-emerald-500/10"
                    : "border-destructive/40 text-destructive bg-destructive/10";

            const money = (n: any) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

            return (
              <Card key={r.id} className={isCancelled ? "opacity-60" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    {/* LEFT — who + what happened */}
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <span
                        className={cn(
                          "mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
                          typeTone,
                        )}
                      >
                        {isScheduled ? <Clock className="h-4 w-4" />
                          : isOneTime ? <Plus className="h-4 w-4" />
                          : isIncrease ? <TrendingUp className="h-4 w-4" />
                          : <TrendingDown className="h-4 w-4" />}
                      </span>

                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-foreground truncate">
                            {r.hr_employees?.first_name} {r.hr_employees?.last_name}
                          </p>
                          {r.hr_employees?.badge_id && (
                            <span className="text-[11px] text-muted-foreground">#{r.hr_employees.badge_id}</span>
                          )}
                          <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide", typeTone)}>
                            {typeLabel}
                          </span>
                          {isCancelled && (
                            <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide border-muted-foreground/30 text-muted-foreground">
                              CANCELLED
                            </span>
                          )}
                        </div>

                        {/* The one line that says everything */}
                        {isOneTime ? (
                          <p className="text-sm text-foreground">
                            <span className="font-semibold tabular-nums text-emerald-600">
                              {money(r.one_time_amount)}
                            </span>{" "}
                            one-time payout
                            {r.payout_month && (
                              <> · paid with <span className="font-medium">{format(new Date(r.payout_month), "MMM yyyy")}</span> payroll</>
                            )}
                          </p>
                        ) : (
                          <p className="text-sm text-foreground flex items-center gap-1.5 flex-wrap">
                            <span className="text-muted-foreground">Annual CTC</span>
                            <span className="text-muted-foreground line-through tabular-nums">{money(r.previous_total)}</span>
                            <span className="text-muted-foreground">→</span>
                            <span className="font-semibold tabular-nums">{money(r.new_total)}</span>
                            <span
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
                                diff >= 0 ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive",
                              )}
                            >
                              {diff >= 0 ? "+" : "−"}{money(Math.abs(diff))}/yr
                            </span>
                            <span className="text-[11px] text-muted-foreground tabular-nums">
                              ({diff >= 0 ? "+" : "−"}{money(Math.round(Math.abs(diff) / 12))}/mo)
                            </span>
                          </p>
                        )}

                        <p className="text-[11px] text-muted-foreground">
                          {isOneTime
                            ? <>Raised {format(new Date(r.created_at), "dd MMM yyyy")}</>
                            : <>Effective <span className="text-foreground font-medium">{r.effective_from}</span> · raised {format(new Date(r.created_at), "dd MMM yyyy")}</>}
                          {r.approved_by && <> · by {r.approved_by}</>}
                          {r.revision_reason && <> · <span className="italic">{r.revision_reason}</span></>}
                        </p>
                      </div>
                    </div>

                    {/* RIGHT — RazorpayX state + action */}
                    <div className="flex items-center gap-2 shrink-0">
                      {syncBadge}
                      {isApplied && !isOneTime && canManage && !pushSyncedAfterRevision && (
                        <Button
                          size="sm"
                          variant={pushFailedAfterRevision ? "default" : "outline"}
                          onClick={() => pushOne(r.employee_id, r.id, Number(r.new_total || 0))}
                          disabled={pushing || !envelopeVerified}
                          title={!envelopeVerified ? "Verify the salary envelope first" : "Push this CTC to RazorpayX"}
                        >
                          {pushing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
                          {pushFailedAfterRevision ? "Retry push" : "Push"}
                        </Button>
                      )}
                      {isApplied && isOneTime && canManage && (!r.razorpay_pushed_at || r.razorpay_push_error) && (
                        <Button
                          size="sm"
                          variant={r.razorpay_push_error ? "default" : "outline"}
                          onClick={() => pushOneTime(r.id)}
                          disabled={pushing || !payrollGateVerified}
                          title={
                            !payrollGateVerified
                              ? "RazorpayX payroll-write gate is locked. Verify the Payroll-run envelope in HRMS → Payroll → RazorpayX Sync."
                              : "Stage this payout on the target RazorpayX payroll month"
                          }
                        >
                          {pushing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
                          {r.razorpay_push_error ? "Retry push" : "Push"}
                        </Button>
                      )}
                      {isScheduled && canManage && (
                        <Button size="sm" variant="ghost" onClick={() => setCancelId(r.id)} title="Cancel scheduled revision">
                          <X className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
  };

  return (
    <TooltipProvider delayDuration={150}>
    <div className="p-4 md:p-6 space-y-4 page-mount">
      <PageHeader
        title={month ? `Salary Revisions — ${monthLabel}` : "Salary Revision History"}
        actions={
          <div className="flex items-center gap-2">
            {canManage && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
                      envelopeVerified
                        ? "border-emerald-500/40 text-emerald-600"
                        : "border-destructive/40 text-destructive",
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", envelopeVerified ? "bg-emerald-500" : "bg-destructive")} />
                    RazorpayX
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-xs">
                  {envelopeVerified
                    ? `Salary push live${envelope?.push_salary_envelope_verified_at ? ` · verified ${format(new Date(envelope.push_salary_envelope_verified_at), "dd MMM yyyy")}` : ""}`
                    : "Salary push disabled — verify the envelope in Payroll Sync · Step E"}
                </TooltipContent>
              </Tooltip>
            )}
            {canManage && !envelopeVerified && (
              <Button asChild size="sm" variant="secondary">
                <Link to="/hrms/payroll/razorpay-sync">Fix sync</Link>
              </Button>
            )}
            {canManage && (
              <Button onClick={() => setShowDialog(true)}>
                <Plus className="h-4 w-4 mr-1.5" /> Revise Salary
              </Button>
            )}
          </div>
        }
      />

      {month && (
        <Card className="border-primary/30">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Effective in this payroll ({monthLabel})
                </p>
                <p className="text-xs text-muted-foreground">
                  CTC revisions effective inside {monthLabel} and one-time payouts targeted at this payroll month.
                  Everything here must be pushed and verified in RazorpayX before LOP is calculated.
                </p>
              </div>
              <Badge variant="outline" className="text-xs">{monthScoped.length} entr{monthScoped.length === 1 ? "y" : "ies"}</Badge>
            </div>
            {monthScoped.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No salary revision becomes effective in {monthLabel}. Nothing to reconcile for this step.
              </p>
            ) : (
              <div className="space-y-3">{monthScoped.map((r: any) => renderRevisionCard(r))}</div>
            )}
          </CardContent>
        </Card>
      )}


      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <TabsList>
            <TabsTrigger value="APPLIED">Applied</TabsTrigger>
            <TabsTrigger value="SCHEDULED">Scheduled</TabsTrigger>
            <TabsTrigger value="CANCELLED">Cancelled</TabsTrigger>
            <TabsTrigger value="ALL">All</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by employee name..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
      </div>


      {isLoading ? (
        <TableSkeleton rows={4} columns={4} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={TrendingUp} title="No salary revisions" description={canManage ? "Click 'Revise Salary' to create one." : "Revisions will appear here once created."} />
      ) : (
        <div className="space-y-3">
          {filtered.map((r: any) => renderRevisionCard(r))}
        </div>
      )}

      <ReviseSalaryDialog open={showDialog} onOpenChange={setShowDialog} />

      <AlertDialog open={!!cancelId} onOpenChange={(o) => !o && setCancelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel scheduled revision?</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel the pending salary revision. The employee's salary will remain unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => cancelId && cancelMutation.mutate(cancelId)}>
              Cancel revision
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </TooltipProvider>
  );

}
