import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { StatusPill, type PillTone } from "@/components/hrms/primitives/StatusPill";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Lock, CalendarClock, Clock, CheckCircle2, AlertTriangle, Ban } from "lucide-react";

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
        return {
          tone: "amber",
          label: "Scheduled",
          icon: <CalendarClock className="h-3 w-3" />,
          tip: `Will be deducted in ${timing}`,
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
          <span className="text-xs text-muted-foreground tabular-nums">
            {(rows as any[]).length} · {inr(total)}
          </span>
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
                  const s = statusMeta(r);
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
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex">
                              <StatusPill tone={s.tone} icon={s.icon}>{s.label}</StatusPill>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="text-xs max-w-[240px]">{s.tip}</TooltipContent>
                        </Tooltip>
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
