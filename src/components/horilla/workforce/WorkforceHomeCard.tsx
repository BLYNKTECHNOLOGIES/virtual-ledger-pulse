import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, UserMinus, UserPlus, ClipboardCheck, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/usePermissions";
import { useForecastEvents, useHiringRequirements, useStaffingMatrix } from "@/hooks/hrms/useWorkforcePlanning";
import { useLeavingSoon } from "@/hooks/hrms/useWorkforceRepair";
import { WorkforceTimingAlerts } from "./WorkforceTimingAlerts";
import { istToday, sumLines } from "@/lib/hrms/workforce";

/** Compact HRMS-home summary; every figure is the same one shown on Workforce Planning pages. */
export function WorkforceHomeCard() {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const allowed = hasPermission("hrms_view") || hasPermission("hrms_manage");
  const matrix = useStaffingMatrix();
  const reqs = useHiringRequirements();
  const leaving = useLeavingSoon();
  const events = useForecastEvents(allowed);

  const month = istToday().slice(0, 7);
  const figures = useMemo(() => {
    const t = sumLines(matrix.rows);
    const awaiting = ((reqs.data || []) as any[]).filter((r) => r.status === "pending_approval").length;
    // Same people in both figures: joiners on a staffing line; "this month" = those dated in this IST month.
    const lineIds = new Set(matrix.rows.map((r) => r.plan_id));
    const onLine = (events.data || []).filter((e) => e.kind === "joiner" && !!e.plan_id && lineIds.has(e.plan_id));
    const joining = onLine.filter((e) => (e.event_date || "").slice(0, 7) === month).reduce((a, e) => a + (Number(e.qty) || 1), 0);
    const joiningAll = onLine.reduce((a, e) => a + (Number(e.qty) || 1), 0);
    const leavingAll = leaving.data || [];
    const leavingMonth = leavingAll.filter((p: any) => (p.last_working_day || "").slice(0, 7) <= month && p.last_working_day).length;
    void t.joining;
    return { short: t.shortNow, awaiting, joining, joiningAll, leavingMonth, leavingAll: leavingAll.length };
  }, [matrix.rows, reqs.data, events.data, leaving.data, month]);

  if (!allowed || matrix.isError) return null;

  const items = [
    { label: "Short now", value: figures.short, sub: "sum of line shortfalls", icon: AlertTriangle, to: "/hrms/workforce-planning/staffing-plan" },
    { label: "Awaiting approval", value: figures.awaiting, sub: "hiring requests", icon: ClipboardCheck, to: "/hrms/workforce-planning/hiring-requirements?tab=pending" },
    { label: "Joining this month", value: figures.joining, sub: `${figures.joiningAll} joining in total`, icon: UserPlus, to: "/hrms/workforce-planning/forecast" },
    { label: "Leaving this month", value: figures.leavingMonth, sub: `${figures.leavingAll} on notice in total`, icon: UserMinus, to: "/hrms/workforce-planning" },
  ];

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Workforce</h3>
        <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => navigate("/hrms/workforce-planning")}>
          Workforce planning <ArrowRight className="h-3 w-3" />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {items.map((i) => (
          <button key={i.label} type="button" onClick={() => navigate(i.to)}
            className="rounded-md border border-border p-3 text-left transition-colors hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><i.icon className="h-3.5 w-3.5" />{i.label}</div>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-foreground">{matrix.isLoading ? "…" : i.value}</p>
            <p className="text-[11px] text-muted-foreground">{i.sub}</p>
          </button>
        ))}
      </div>
      <div className="mt-3"><WorkforceTimingAlerts compact /></div>
    </div>
  );
}
