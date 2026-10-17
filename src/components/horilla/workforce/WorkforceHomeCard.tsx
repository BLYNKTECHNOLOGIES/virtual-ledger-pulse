import { useMemo } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, ClipboardCheck, UserMinus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MetricStrip } from "@/components/ats/AtsUi";
import { usePermissions } from "@/hooks/usePermissions";
import { useForecastEvents, useHiringRequirements, useStaffingMatrix } from "@/hooks/hrms/useWorkforcePlanning";
import { useLeavingSoon } from "@/hooks/hrms/useWorkforceRepair";
import { WorkforceTimingAlerts } from "./WorkforceTimingAlerts";
import { cn } from "@/lib/utils";
import { istToday, sumLines } from "@/lib/hrms/workforce";

/** Compact HRMS-home summary; every figure is the same one shown on Workforce Planning pages. */
export function WorkforceHomeCard() {
  const { hasPermission } = usePermissions();
  const allowed = hasPermission("hrms_view") || hasPermission("hrms_manage");
  const matrix = useStaffingMatrix();
  const reqs = useHiringRequirements();
  const leaving = useLeavingSoon();
  const events = useForecastEvents(allowed);

  const month = istToday().slice(0, 7);
  const figures = useMemo(() => {
    const t = sumLines(matrix.rows);
    const pending = ((reqs.data || []) as any[]).filter((r) => r.status === "pending_approval");
    const awaitingPeople = pending.reduce((a, r) => a + Math.max(0, (r.number_required ?? 0) - (r.positions_filled ?? 0)), 0);
    // Same people in both figures: joiners on a staffing line; "this month" = those dated in this IST month.
    const lineIds = new Set(matrix.rows.map((r) => r.plan_id));
    const onLine = (events.data || []).filter((e) => e.kind === "joiner" && !!e.plan_id && lineIds.has(e.plan_id));
    const joining = onLine.filter((e) => (e.event_date || "").slice(0, 7) === month).reduce((a, e) => a + (Number(e.qty) || 1), 0);
    const joiningAll = onLine.reduce((a, e) => a + (Number(e.qty) || 1), 0);
    const leavingAll = leaving.data || [];
    const leavingMonth = leavingAll.filter((p: any) => p.last_working_day && (p.last_working_day || "").slice(0, 7) <= month).length;
    return { short: t.shortNow, net: t.netNeed, awaiting: pending.length, awaitingPeople, joining, joiningAll, leavingMonth, leavingAll: leavingAll.length };
  }, [matrix.rows, reqs.data, events.data, leaving.data, month]);

  // Hidden for people without HRMS access, and when the figures can't load at all (a failed refresh keeps the last ones).
  if (!allowed || (matrix.isError && matrix.rows.length === 0)) return null;

  const items = [
    { label: "Short now", value: figures.short, tone: figures.short > 0 ? "text-destructive" : "text-foreground", icon: AlertTriangle,
      sub: figures.net !== figures.short ? `${figures.net} after trainees and joiners` : "across all staffing lines", to: "/hrms/workforce-planning/staffing-plan?status=short" },
    { label: "Awaiting approval", value: figures.awaiting, tone: "text-foreground", icon: ClipboardCheck,
      sub: figures.awaiting ? `request${figures.awaiting === 1 ? "" : "s"} · ${figures.awaitingPeople} ${figures.awaitingPeople === 1 ? "person" : "people"}` : "nothing to approve", to: "/hrms/workforce-planning/hiring-requirements?tab=pending" },
    { label: "Joining this month", value: figures.joining, tone: "text-foreground", icon: UserPlus,
      sub: `${figures.joiningAll} joining in total`, to: "/hrms/workforce-planning/forecast" },
    { label: "Leaving this month", value: figures.leavingMonth, tone: figures.leavingMonth > 0 ? "text-amber-600 dark:text-amber-400" : "text-foreground", icon: UserMinus,
      sub: `${figures.leavingAll} on notice in total`, to: "/hrms/workforce-planning/forecast" },
  ];
  const loading = matrix.isLoading && matrix.rows.length === 0;

  return (
    <section className="rounded-lg border border-border bg-card" aria-label="Workforce planning">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Workforce</h3>
        <Button asChild size="sm" variant="ghost" className="h-8 gap-1 text-primary">
          <Link to="/hrms/workforce-planning">Workforce planning <ArrowRight className="h-3.5 w-3.5" /></Link>
        </Button>
      </header>
      <div className="space-y-3 p-4">
        <MetricStrip className="rounded-lg sm:grid-cols-4 xl:grid-cols-4">
          {items.map((i) => (
            <Link key={i.label} to={i.to}
              className="group block min-w-0 bg-card px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground group-hover:text-foreground">
                <i.icon className="h-3.5 w-3.5 shrink-0" aria-hidden />{i.label}
              </span>
              {loading ? <Skeleton className="mt-2 h-7 w-12" /> : (
                <span className={cn("mt-1 block font-mono text-2xl font-bold tabular-nums leading-8", i.tone)}>{i.value}</span>
              )}
              <span className="block text-[11px] leading-4 text-muted-foreground">{loading ? " " : i.sub}</span>
            </Link>
          ))}
        </MetricStrip>
        <WorkforceTimingAlerts compact />
      </div>
    </section>
  );
}
