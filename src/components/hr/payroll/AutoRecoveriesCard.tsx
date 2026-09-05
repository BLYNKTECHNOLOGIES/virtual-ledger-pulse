import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { StatusPill, type PillTone } from "@/components/hrms/primitives/StatusPill";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { Lock, CalendarClock, Clock, CheckCircle2, AlertTriangle, Ban, Send, Loader2 } from "lucide-react";

type Props = { period: string }; // YYYY-MM

const inr = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

/**
 * Read-only mirror of every automatic recovery scheduled for the period.
 * Presentation only: progress is shown as a bar, status as an icon pill;
 * all narrative detail lives in tooltips.
 */
export function AutoRecoveriesCard({ period }: Props) {
  const periodDate = `${period}-01`;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["payroll_auto_recoveries", periodDate],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_payroll_auto_recoveries")
        .select("*")
        .eq("period_month", periodDate)
        .order("employee_name", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // Staged deduction rows for this period, keyed by the recovery they came from.
  // The recovery row itself stays "scheduled" until RazorpayX settles it, so the
  // staging state has to be read from Payroll Inputs → Deductions.
  const { data: stagedRows = [] } = useQuery({
    queryKey: ["payroll_auto_recovery_staged", periodDate],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_payroll_input_deductions")
        .select("id, recovery_ref_id, recovery_kind, amount, pushed_at, readback_verified_at")
        .eq("source", "auto_recovery")
        .eq("period_month", periodDate);
      if (error) throw error;
      return data || [];
    },
  });

  const stagedByRef = useMemo(() => {
    const m = new Map<string, any>();
    for (const d of stagedRows as any[]) if (d.recovery_ref_id) m.set(d.recovery_ref_id, d);
    return m;
  }, [stagedRows]);

  const qc = useQueryClient();


  // "Awaiting HR push" rows whose deduction hasn't been staged yet (the
  // nightly staging job hasn't run) can be staged on demand — this only
  // creates the review row in Payroll Inputs → Deductions; HR still pushes.
  const stageNow = useMutation({
    mutationFn: async (r: any) => {
      const { data: res, error } = await (supabase as any).functions.invoke("hr-schedule-deposits", {
        body: { kind: r.source_kind, id: r.parent_id },
      });
      if (error) throw error;
      if (!res?.ok) throw new Error(res?.error || "Staging failed");
      const mine = (res.results || []).filter((x: any) => x.ok && (x.staged || x.already_staged));
      if (!mine.length) {
        const skipped = (res.results || []).map((x: any) => x.skipped || x.error).filter(Boolean);
        throw new Error(skipped[0] || "Nothing was staged for this recovery");
      }
      return res;
    },
    onSuccess: () => {
      toast.success("Staged in Payroll Inputs → Deductions — review and push it there");
      qc.invalidateQueries({ queryKey: ["payroll_auto_recoveries"] });
      qc.invalidateQueries({ queryKey: ["payroll_auto_recovery_staged"] });
      qc.invalidateQueries({ queryKey: ["payroll_inputs"] });
    },
    onError: (e: any) => toast.error(e.message || "Could not stage this recovery"),
  });

  const pendingRows = useMemo(
    () => (rows as any[]).filter((r) => r.status === "scheduled" && !stagedByRef.has(r.id)),
    [rows, stagedByRef],
  );

  // Bulk staging — same per-row contract, run sequentially so each recovery
  // gets its own result and one failure never hides the rest.
  const stageAll = useMutation({
    mutationFn: async (list: any[]) => {
      let staged = 0;
      const failures: string[] = [];
      for (const r of list) {
        try {
          const { data: res, error } = await (supabase as any).functions.invoke(
            "hr-schedule-deposits",
            { body: { kind: r.source_kind, id: r.parent_id } },
          );
          if (error) throw error;
          if (!res?.ok) throw new Error(res?.error || "Staging failed");
          const mine = (res.results || []).filter((x: any) => x.ok && (x.staged || x.already_staged));
          if (!mine.length) {
            const skipped = (res.results || []).map((x: any) => x.skipped || x.error).filter(Boolean);
            throw new Error(skipped[0] || "Nothing was staged");
          }
          staged += 1;
        } catch (e: any) {
          failures.push(`${r.employee_name || "—"}: ${e?.message || "failed"}`);
        }
      }
      return { staged, failures };
    },
    onSuccess: ({ staged, failures }) => {
      if (staged) toast.success(`${staged} recover${staged === 1 ? "y" : "ies"} staged in Payroll Inputs → Deductions`);
      if (failures.length) toast.error(`${failures.length} could not be staged — ${failures[0]}`);
      qc.invalidateQueries({ queryKey: ["payroll_auto_recoveries"] });
      qc.invalidateQueries({ queryKey: ["payroll_auto_recovery_staged"] });
      qc.invalidateQueries({ queryKey: ["payroll_inputs"] });
    },
    onError: (e: any) => toast.error(e.message || "Bulk staging failed"),
  });

  const total = useMemo(
    () => (rows as any[]).reduce((s, r) => s + Number(r.amount || 0), 0),
    [rows],
  );

  const currentPeriod = new Date().toISOString().slice(0, 7);
  const periodLabel = new Date(`${period}-01T00:00:00`).toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
  });
  const timing =
    period === currentPeriod
      ? `this payroll (${periodLabel})`
      : period > currentPeriod
        ? `a future payroll (${periodLabel})`
        : `the ${periodLabel} payroll (not yet processed)`;

  const statusMeta = (
    r: any,
    staged?: any,
  ): { tone: PillTone; label: string; icon: JSX.Element; tip: string } => {
    switch (r.status) {
      case "collected":
        return {
          tone: "emerald",
          label: "Collected",
          icon: <CheckCircle2 className="h-3 w-3" />,
          tip: `Deducted and settled in the ${periodLabel} payroll`,
        };
      case "pushed":
      case "paid":
        return {
          tone: "info",
          label: "Pushed",
          icon: <Clock className="h-3 w-3" />,
          tip: `On the ${periodLabel} run — settles when payroll is locked`,
        };
      case "failed":
        return {
          tone: "destructive",
          label: "Failed",
          icon: <AlertTriangle className="h-3 w-3" />,
          tip: r.failure_reason || "Push failed — will retry",
        };
      case "cancelled":
        return {
          tone: "default",
          label: "Cancelled",
          icon: <Ban className="h-3 w-3" />,
          tip: "No longer recovered",
        };
      default:
        if (staged?.readback_verified_at)
          return {
            tone: "emerald",
            label: "Verified on run",
            icon: <CheckCircle2 className="h-3 w-3" />,
            tip: `Pushed to RazorpayX and read back on the ${periodLabel} run.`,
          };
        if (staged?.pushed_at)
          return {
            tone: "info",
            label: "Pushed",
            icon: <Clock className="h-3 w-3" />,
            tip: `Pushed to the ${periodLabel} RazorpayX run — read-back verification pending.`,
          };
        if (staged)
          return {
            tone: "info",
            label: "Staged for review",
            icon: <CalendarClock className="h-3 w-3" />,
            tip: `Deduction row created in Payroll Inputs → Deductions for ${timing}. HR pushes it from there.`,
          };
        return {
          tone: "amber",
          label: "Not staged yet",
          icon: <CalendarClock className="h-3 w-3" />,
          tip: `Staged as a deduction for ${timing} — HR reviews and pushes it from Payroll Inputs → Deductions. Nothing is sent to RazorpayX automatically.`,
        };

    }
  };

  return (
    <TooltipProvider delayDuration={120}>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 flex-wrap">
          <CardTitle className="text-sm flex items-center gap-2">
            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
            Automatic recoveries · {periodLabel}
          </CardTitle>
          <div className="flex items-center gap-3">
            {pendingRows.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2.5 text-[11px]"
                disabled={stageAll.isPending || stageNow.isPending}
                onClick={() => stageAll.mutate(pendingRows)}
              >
                {stageAll.isPending ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Send className="h-3 w-3 mr-1" />
                )}
                Stage all pending ({pendingRows.length})
              </Button>
            )}
            <span className="text-xs text-muted-foreground tabular-nums">
              {(rows as any[]).length} · {inr(total)}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                {["Employee", "Recovery", "Amount", "Progress", "Status"].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-muted-foreground">Loading…</td>
                </tr>
              ) : (rows as any[]).length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted-foreground">
                    No automatic recoveries scheduled.
                  </td>
                </tr>
              ) : (
                (rows as any[]).map((r) => {
                  const staged = stagedByRef.get(r.id);
                  const s = statusMeta(r, staged);
                  const totalAmt = Number(r.total_amount || 0);
                  const collected = Number(r.collected_amount || 0);
                  const afterThis = Math.max(0, totalAmt - collected - Number(r.amount || 0));
                  const pct = totalAmt > 0 ? Math.min(100, ((collected + Number(r.amount || 0)) / totalAmt) * 100) : 0;
                  const isFinal = Number(r.remaining_after || 0) <= 0.01;
                  return (
                    <tr key={`${r.source_kind}-${r.id}`} className="border-b hover:bg-muted/30">
                      <td className="px-3 py-2 whitespace-nowrap">{r.employee_name || "—"}</td>
                      <td className="px-3 py-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-default">
                              {r.label}
                              <span className="ml-1 text-xs text-muted-foreground tabular-nums">
                                {r.installment_no}
                                {r.total_installments ? `/${r.total_installments}` : ""}
                              </span>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="text-xs">
                            Installment {r.installment_no}
                            {r.total_installments ? ` of ${r.total_installments}` : ""} ·{" "}
                            {r.razorpay_code}
                          </TooltipContent>
                        </Tooltip>
                      </td>
                      <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                        {inr(r.amount)}
                        {isFinal && (
                          <span className="ml-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                            final
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 w-[180px]">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center gap-2 cursor-default">
                              <Progress value={pct} className="h-1.5 flex-1" />
                              <span className="text-[11px] text-muted-foreground tabular-nums w-9 text-right">
                                {Math.round(pct)}%
                              </span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent className="text-xs">
                            {inr(collected)} of {inr(totalAmt)} recovered ·{" "}
                            {afterThis > 0.01 ? `${inr(afterThis)} left after this` : "completes the recovery"}
                          </TooltipContent>
                        </Tooltip>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex">
                                <StatusPill tone={s.tone} icon={s.icon}>{s.label}</StatusPill>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="text-xs max-w-[240px]">{s.tip}</TooltipContent>
                          </Tooltip>
                          {r.status === "scheduled" && !staged && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 px-2 text-[11px]"
                                  disabled={stageNow.isPending}
                                  onClick={() => stageNow.mutate(r)}
                                >
                                  {stageNow.isPending ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Send className="h-3 w-3 mr-1" />
                                  )}
                                  Stage now
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs max-w-[240px]">
                                Creates the review row in Payroll Inputs → Deductions right now
                                (the nightly job hasn't staged it yet). You still push it manually
                                from there.
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
