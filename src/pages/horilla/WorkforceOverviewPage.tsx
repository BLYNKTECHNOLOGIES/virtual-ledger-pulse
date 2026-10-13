import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeftRight, ArrowRight, Briefcase, CalendarClock, ClipboardList, GraduationCap, LayoutGrid,
  ThumbsDown, ThumbsUp, UserCheck, UserMinus, UserPlus, Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { TableSkeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/hooks/usePermissions";
import { WorkforceFilters } from "@/components/horilla/workforce/WorkforceFilters";
import { WorkforceKpiCard } from "@/components/horilla/workforce/WorkforceKpiCard";
import { HiringRequirementDialog } from "@/components/horilla/workforce/HiringRequirementDialog";
import { WorkforceAlertsStrip } from "@/components/horilla/workforce/WorkforceAlertsStrip";
import { RequirementReasonDialog, type ReasonTarget } from "@/components/horilla/workforce/RequirementReasonDialog";
import {
  useHiringRequirements, useRequirementTransition, useStaffingMatrix, useWorkforceFlows, useWorkforceLookups,
} from "@/hooks/hrms/useWorkforcePlanning";
import {
  EMPTY_FILTERS, PRIORITY_CLASS, PRIORITY_LABEL, REQ_STATUS_CLASS, REQ_STATUS_LABEL, daysUntil, findRebalances,
  formatIstDate, matchesFilters, planningShifts, sortByOperatingOrder, sumLines, type StaffingDerived, type WorkforceFilterState,
} from "@/lib/hrms/workforce";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";

const OPEN = new Set(["pending_approval", "approved", "recruitment_active", "partially_fulfilled"]);
const PRIORITY_ORDER = ["critical", "high", "medium", "low"];

export default function WorkforceOverviewPage() {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission("hrms_manage");
  const navigate = useNavigate();
  const [filters, setFilters] = useState<WorkforceFilterState>({ ...EMPTY_FILTERS });
  const [seed, setSeed] = useState<any | null>(null);
  const [reasonTarget, setReasonTarget] = useState<ReasonTarget | null>(null);

  const matrix = useStaffingMatrix();
  const { rows } = matrix;
  const { data: lookups } = useWorkforceLookups();
  const reqs = useHiringRequirements();
  const requirements = (reqs.data || []) as any[];
  const { data: flows } = useWorkforceFlows();
  const transition = useRequirementTransition();

  const title = (id: string) => (lookups?.positions || []).find((p) => p.id === id)?.title;
  const filtered = useMemo(() => rows.filter((r) => matchesFilters(r, filters)), [rows, filters]);
  const t = useMemo(() => sumLines(filtered), [filtered]);

  const reqsByLine = useMemo(() => {
    const m = new Map<string, any[]>();
    requirements.filter((r) => OPEN.has(r.status) && r.staffing_plan_id).forEach((r) => {
      m.set(r.staffing_plan_id, [...(m.get(r.staffing_plan_id) || []), r]);
    });
    return m;
  }, [requirements]);
  const pending = requirements.filter((r) => r.status === "pending_approval");
  const lineIds = new Set(filtered.map((r) => r.plan_id));
  const openReqs = requirements.filter((r) => OPEN.has(r.status) && (!r.staffing_plan_id || lineIds.has(r.staffing_plan_id)));

  const nextLeaving = useMemo(() => {
    const dates = (flows?.notice || []).map((n: any) => n.exit_date).filter(Boolean).sort();
    return dates[0] ?? null;
  }, [flows]);

  const actionRows = useMemo(
    () =>
      filtered
        .filter((r) => r.netHiringRequirement > 0)
        .sort((a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority) || b.netHiringRequirement - a.netHiringRequirement),
    [filtered],
  );
  const rebalances = useMemo(() => findRebalances(filtered), [filtered]);

  const deptChart = useMemo(() => {
    const m = new Map<string, { name: string; current: number; required: number; approved: number }>();
    filtered.forEach((r) => {
      const name = r.department_name || "Unassigned";
      const e = m.get(name) || { name, current: 0, required: 0, approved: 0 };
      e.current += r.current_hc; e.required += r.required_hc; e.approved += r.approved_hc;
      m.set(name, e);
    });
    return Array.from(m.values()).sort((a, b) => b.required - a.required);
  }, [filtered]);

  const shiftRows = useMemo(() => {
    const starts = new Map(((lookups?.shifts || []) as any[]).map((s) => [s.name, s.start_time]));
    const m = new Map<string, { name: string; start_time: string | null; required: number; current: number; short: number; over: number }>();
    filtered.forEach((r) => {
      const e = m.get(r.shiftLabel) || { name: r.shiftLabel, start_time: starts.get(r.shiftLabel) ?? null, required: 0, current: 0, short: 0, over: 0 };
      e.required += r.required_hc; e.current += r.current_hc;
      e.short += Math.max(0, r.staffingGap); e.over += Math.max(0, -r.staffingGap);
      m.set(r.shiftLabel, e);
    });
    return sortByOperatingOrder(Array.from(m.values()));
  }, [filtered, lookups?.shifts]);

  /** Per-line alerts; the deadline uses the requirement's date when the line has none. */
  const lineAlerts = useMemo(
    () =>
      filtered
        .map((r) => {
          const alerts = r.alerts.filter((a) => !a.endsWith("on notice period"));
          if (!r.target_date && r.netHiringRequirement > 0) {
            const soon = (reqsByLine.get(r.plan_id) || []).some((q) => q.target_joining_date && daysUntil(q.target_joining_date) <= 15);
            if (soon) alerts.push("Hiring deadline approaching");
          }
          return { r, alerts };
        })
        .filter((x) => x.alerts.length > 0),
    [filtered, reqsByLine],
  );

  const create = (r: StaffingDerived) =>
    setSeed({
      department_id: r.department_id!, position_id: r.position_id!, shift_id: r.shift_id,
      shift_label: r.shiftLabel === "Any shift" ? null : r.shiftLabel, employment_type: r.employment_type,
      number_required: r.uncoveredHiringRequirement, target_joining_date: r.target_date, priority: r.priority,
      staffing_plan_id: r.plan_id,
    });
  const openReq = (id: string) => navigate(`/hrms/workforce-planning/hiring-requirements?req=${id}`);

  return (
    <div className="space-y-4 p-3 md:p-6">
      <PageHeader
        title="Workforce planning overview"
        description="Who we need to hire, how many, where, for which shift and by when. Every figure is a sum of the staffing lines."
        actions={
          <Button asChild variant="outline">
            <Link to="/hrms/workforce-planning/staffing-plan">Open staffing plan <ArrowRight className="h-4 w-4" /></Link>
          </Button>
        }
      />

      <WorkforceFilters
        value={filters}
        onChange={setFilters}
        departments={lookups?.departments || []}
        positions={lookups?.positions || []}
        shifts={planningShifts((lookups?.shifts || []) as any[])}
      />

      {matrix.isLoading ? (
        <TableSkeleton />
      ) : matrix.isError ? (
        <ErrorState title="Couldn't load staffing figures" error={matrix.error} onRetry={() => matrix.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No staffing lines yet" description="Add lines in the staffing plan to see who needs to be hired." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <WorkforceKpiCard label="On roll" value={t.current} icon={Users}
              hint={flows ? `Planned roles · ${flows.activeCount} company-wide incl. leadership outside planning` : "Planned roles"} />
            <WorkforceKpiCard label="Required" value={t.required} icon={Briefcase} hint={`Approved ${t.approved} · vacant ${t.vacant}`} />
            <WorkforceKpiCard label="Short now" value={t.shortNow} icon={UserPlus} tone={t.shortNow > 0 ? "danger" : "success"}
              hint={`Net need ${t.netNeed} after pipeline and trainees`} />
            <WorkforceKpiCard label="In training" value={t.inTraining} icon={GraduationCap}
              hint={t.nextReadyDate ? `Next ready ${formatIstDate(t.nextReadyDate)}` : "Nobody in training"} />
            <WorkforceKpiCard label="Hiring in progress" value={t.requested} icon={ClipboardList}
              hint={`${pending.length} awaiting approval · ${t.uncovered} not yet requested`} />
            <WorkforceKpiCard label="Pipeline" value={t.pipeline} icon={CalendarClock} hint={`${t.selected} selected · ${t.joining} joining`} />
            <WorkforceKpiCard label="Approved" value={t.approved} icon={UserCheck} hint={`Vacant seats ${t.vacant} (approved − on roll per line)`} />
            <WorkforceKpiCard label="Leaving soon" value={t.notice} icon={UserMinus} tone={t.notice > 0 ? "warning" : "default"}
              hint={nextLeaving ? `Next last day ${formatIstDate(nextLeaving)}` : "Nobody on notice"} />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Hiring action required</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {actionRows.length === 0 ? (
                <EmptyState icon={UserCheck} title="No hiring needed right now"
                  description="Every line is staffed, or its shortage is covered by selected candidates, joiners and trainees." />
              ) : (
                actionRows.map((r) => {
                  const lineReqs = reqsByLine.get(r.plan_id) || [];
                  const pendingReq = lineReqs.find((q) => q.status === "pending_approval");
                  return (
                    <div key={r.plan_id} className="rounded-lg border border-border p-3">
                      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 space-y-1">
                          <p className="text-sm font-semibold text-foreground">
                            {r.department_name} · {r.position_title} · {r.shiftLabel}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Required {r.required_hc} · On roll {r.current_hc} · Approved {r.approved_hc} · Pipeline {r.pipeline_hc} · Joining {r.pending_joining_hc} · In training {r.in_training_hc} · Target {formatIstDate(r.target_date ?? lineReqs[0]?.target_joining_date)}
                          </p>
                          {lineReqs.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {lineReqs.map((q) => (
                                <button key={q.id} type="button" onClick={() => openReq(q.id)}>
                                  <Badge variant="outline" className={REQ_STATUS_CLASS[q.status]}>
                                    {q.requirement_no} · {q.number_required} · {REQ_STATUS_LABEL[q.status]}
                                  </Badge>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          <Badge variant="outline" className={PRIORITY_CLASS[r.priority]}>{PRIORITY_LABEL[r.priority]}</Badge>
                          <div className="text-right">
                            <span className="block text-lg font-semibold tabular-nums text-destructive">Need {r.netHiringRequirement}</span>
                            <span className="block text-xs text-muted-foreground">
                              {r.uncoveredHiringRequirement > 0 ? `${r.uncoveredHiringRequirement} not requested` : `${r.open_requirement_hc} requested`}
                            </span>
                          </div>
                          {canManage && pendingReq && (
                            <>
                              <Button size="sm" variant="outline" className="text-destructive"
                                onClick={() => setReasonTarget({ id: pendingReq.id, requirement_no: pendingReq.requirement_no, action: "reject" })}>
                                <ThumbsDown className="h-3.5 w-3.5" /> Reject
                              </Button>
                              <Button size="sm" disabled={transition.isPending} onClick={() => transition.mutate({ id: pendingReq.id, action: "approve" })}>
                                <ThumbsUp className="h-3.5 w-3.5" /> Approve
                              </Button>
                            </>
                          )}
                          {lineReqs[0] && !pendingReq && (
                            <Button size="sm" variant="outline" onClick={() => openReq(lineReqs[0].id)}>Open requirement</Button>
                          )}
                          {canManage && r.uncoveredHiringRequirement > 0 && (
                            <Button size="sm" onClick={() => create(r)}>Create requirement</Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {rebalances.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base"><ArrowLeftRight className="h-4 w-4 text-primary" /> Rebalance before hiring</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5 text-sm text-foreground">
                  {rebalances.map((h) => <li key={h.key} className="rounded-md border border-border p-2.5">{h.message}</li>)}
                </ul>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2"><CardTitle className="text-base">Waiting for approval</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {reqs.isError ? (
                  <p className="text-sm text-destructive">Couldn't load hiring requirements.</p>
                ) : pending.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing is waiting for approval.</p>
                ) : (
                  pending.map((q) => (
                    <div key={q.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-2.5">
                      <button type="button" className="min-w-0 text-left" onClick={() => openReq(q.id)}>
                        <p className="truncate text-sm font-medium text-foreground">
                          {q.requirement_no} · {q.positions?.title} · {q.shift_label || "Any shift"} · {q.number_required}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {q.departments?.name} · target {formatIstDate(q.target_joining_date)} · {q.source === "capacity_occupancy" ? "raised by the system" : `raised by ${q.requested_by_name || "—"}`}
                        </p>
                      </button>
                      {canManage && (
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" className="text-destructive"
                            onClick={() => setReasonTarget({ id: q.id, requirement_no: q.requirement_no, action: "reject" })}>
                            <ThumbsDown className="h-3.5 w-3.5" /> Reject
                          </Button>
                          <Button size="sm" disabled={transition.isPending} onClick={() => transition.mutate({ id: q.id, action: "approve" })}>
                            <ThumbsUp className="h-3.5 w-3.5" /> Approve
                          </Button>
                        </div>
                      )}
                    </div>
                  ))
                )}
                {openReqs.length > 0 && (
                  <p className="pt-1 text-xs text-muted-foreground">{openReqs.length} open requirements in total.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Alerts</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {lineAlerts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No line needs attention.</p>
                ) : (
                  lineAlerts.slice(0, 12).map(({ r, alerts }) => (
                    <div key={r.plan_id} className="rounded-lg border border-border p-2.5">
                      <p className="truncate text-sm text-foreground">{r.position_title} · {r.shiftLabel}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {alerts.map((a) => <Badge key={a} variant="outline" className="text-xs">{a}</Badge>)}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <WorkforceAlertsStrip rows={rows} positionTitle={title} canManage={canManage}
            onPlanDesks={(s) => navigate(`/hrms/workforce-planning/staffing-plan?plan_desk=${s.id}`)}
            onOpenLine={(id) => navigate(`/hrms/workforce-planning/staffing-plan?line=${id}`)} />

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2"><CardTitle className="text-base">Department-wise headcount</CardTitle></CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={deptChart} margin={{ top: 8, right: 8, bottom: 8, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <ChartTooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="current" name="On roll" fill="hsl(var(--primary))" radius={3} />
                    <Bar dataKey="required" name="Required" fill="hsl(var(--chart-2, 200 80% 50%))" radius={3} />
                    <Bar dataKey="approved" name="Approved" fill="hsl(var(--muted-foreground))" radius={3} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><LayoutGrid className="h-4 w-4" /> Shift-wise staffing</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {shiftRows.map((s) => (
                  <div key={s.name} className="flex items-center justify-between rounded-lg border border-border p-2.5">
                    <div>
                      <p className="text-sm font-medium text-foreground">{s.name}</p>
                      <p className="text-xs text-muted-foreground">Required {s.required} · On roll {s.current}</p>
                    </div>
                    <div className="text-right text-xs font-semibold">
                      {s.short > 0 && <p className="text-destructive">short {s.short}</p>}
                      {s.over > 0 && <p className="text-warning">over {s.over}</p>}
                      {s.short === 0 && s.over === 0 && <p className="text-success">met</p>}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <HiringRequirementDialog open={!!seed} onOpenChange={(o) => !o && setSeed(null)} initial={seed ?? undefined} />
      <RequirementReasonDialog target={reasonTarget} onClose={() => setReasonTarget(null)} />
    </div>
  );
}
