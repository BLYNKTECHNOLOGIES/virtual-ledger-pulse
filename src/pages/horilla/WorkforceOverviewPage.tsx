import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  CalendarClock,
  ClipboardList,
  LayoutGrid,
  TrendingDown,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { TableSkeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/hooks/usePermissions";
import { WorkforceFilters } from "@/components/horilla/workforce/WorkforceFilters";
import { WorkforceKpiCard } from "@/components/horilla/workforce/WorkforceKpiCard";
import { HiringRequirementDialog } from "@/components/horilla/workforce/HiringRequirementDialog";
import {
  useHiringRequirements,
  useStaffingMatrix,
  useUnplannedScopes,
  useWorkforceFlows,
  useWorkforceLookups,
} from "@/hooks/hrms/useWorkforcePlanning";
import {
  EMPTY_FILTERS,
  PRIORITY_CLASS,
  PRIORITY_LABEL,
  formatIstDate,
  matchesFilters,
  type WorkforceFilterState,
} from "@/lib/hrms/workforce";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";

const OPEN_STATUSES = new Set([
  "pending_approval",
  "approved",
  "recruitment_active",
  "partially_fulfilled",
]);

export default function WorkforceOverviewPage() {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission("hrms_manage");
  const [filters, setFilters] = useState<WorkforceFilterState>({ ...EMPTY_FILTERS });
  const [seed, setSeed] = useState<any | null>(null);

  const { rows, isLoading } = useStaffingMatrix();
  const { data: lookups } = useWorkforceLookups();
  const { data: requirements = [] } = useHiringRequirements();
  const { data: flows } = useWorkforceFlows();
  const { data: unplanned = [] } = useUnplannedScopes();

  const filtered = useMemo(
    () => rows.filter((r) => matchesFilters(r, filters)),
    [rows, filters],
  );

  const locations = useMemo(
    () => Array.from(new Set(rows.map((r) => r.location || "—"))).sort(),
    [rows],
  );

  const totals = useMemo(() => {
    const sum = (key: keyof (typeof filtered)[number]) =>
      filtered.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);
    const approved = sum("approved_hc");
    const required = sum("required_hc");
    const current = sum("current_hc");
    const pipeline = sum("pipeline_hc");
    const pending = sum("pending_joining_hc");
    const selected = sum("selected_hc");
    const notice = sum("notice_period_hc");
    const netHiring = filtered.reduce((a, r) => a + r.netHiringRequirement, 0);
    const uncoveredHiring = filtered.reduce((a, r) => a + r.uncoveredHiringRequirement, 0);
    return {
      approved,
      required,
      current,
      pipeline,
      pending,
      selected,
      notice,
      netHiring,
      uncoveredHiring,
      vacantSeats: approved - current,
      hiringRequired: Math.max(0, required - current),
      projectedGap: required - (current + pending + selected - notice),
    };
  }, [filtered]);

  const openRequirements = useMemo(
    () => requirements.filter((r: any) => OPEN_STATUSES.has(r.status)),
    [requirements],
  );

  const actionRows = useMemo(
    () =>
      filtered
        .filter((r) => r.netHiringRequirement > 0)
        .sort((a, b) => {
          const order = ["critical", "high", "medium", "low"];
          const p = order.indexOf(a.priority) - order.indexOf(b.priority);
          return p !== 0 ? p : b.netHiringRequirement - a.netHiringRequirement;
        })
        .slice(0, 6),
    [filtered],
  );

  const deptChart = useMemo(() => {
    const map = new Map<string, { name: string; current: number; required: number; approved: number }>();
    filtered.forEach((r) => {
      const name = r.department_name || "Unassigned";
      const entry = map.get(name) || { name, current: 0, required: 0, approved: 0 };
      entry.current += r.current_hc;
      entry.required += r.required_hc;
      entry.approved += r.approved_hc;
      map.set(name, entry);
    });
    return Array.from(map.values()).sort((a, b) => b.required - a.required);
  }, [filtered]);

  const shiftRows = useMemo(() => {
    const map = new Map<string, { shift: string; required: number; current: number }>();
    filtered.forEach((r) => {
      const shift = r.shift_name || "General";
      const entry = map.get(shift) || { shift, required: 0, current: 0 };
      entry.required += r.required_hc;
      entry.current += r.current_hc;
      map.set(shift, entry);
    });
    return Array.from(map.values()).sort((a, b) => a.shift.localeCompare(b.shift));
  }, [filtered]);

  const alerts = useMemo(
    () =>
      filtered
        .filter((r) => r.alerts.length > 0)
        .map((r) => ({
          key: r.plan_id,
          label: `${r.position_title ?? "Position"} · ${r.department_name ?? ""}${
            r.shift_name ? ` · ${r.shift_name}` : ""
          }`,
          alerts: r.alerts,
        }))
        .slice(0, 8),
    [filtered],
  );

  return (
    <div className="space-y-4 p-3 md:p-6">
      <PageHeader
        title="Workforce planning overview"
        description="How many people we have, how many we are allowed, how many we need, and what is already being hired. Every number is derived from live employee and recruitment records."
        actions={
          canManage && (
            <Button asChild variant="outline">
              <Link to="/hrms/workforce-planning/staffing-plan">
                Open staffing plan <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          )
        }
      />

      <WorkforceFilters
        value={filters}
        onChange={setFilters}
        departments={lookups?.departments || []}
        positions={lookups?.positions || []}
        shifts={lookups?.shifts || []}
        locations={locations}
      />

      {isLoading ? (
        <TableSkeleton />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <WorkforceKpiCard
              label="Employees on roll"
              value={totals.current}
              hint={`${flows?.activeCount ?? 0} active company-wide`}
              icon={Users}
            />
            <WorkforceKpiCard
              label="Approved headcount"
              value={totals.approved}
              hint="Sanctioned by management"
              icon={UserCheck}
            />
            <WorkforceKpiCard
              label="Required headcount"
              value={totals.required}
              hint="What the business needs"
              icon={Briefcase}
            />
            <WorkforceKpiCard
              label="Vacant seats"
              value={totals.vacantSeats}
              hint="Approved minus on roll"
              icon={LayoutGrid}
              tone={totals.vacantSeats > 0 ? "warning" : "default"}
            />
            <WorkforceKpiCard
              label="Hiring required"
              value={totals.hiringRequired}
              hint={`${totals.netHiring} after pipeline · ${totals.uncoveredHiring} not yet requested`}
              icon={UserPlus}
              tone={totals.hiringRequired > 0 ? "danger" : "success"}
            />
            <WorkforceKpiCard
              label="Open hiring requirements"
              value={openRequirements.length}
              hint={`${openRequirements.reduce(
                (a: number, r: any) => a + (r.number_required || 0),
                0,
              )} people requested`}
              icon={ClipboardList}
            />
            <WorkforceKpiCard
              label="In recruitment pipeline"
              value={totals.pipeline}
              hint={`${totals.selected} selected · ${totals.pending} joining pending`}
              icon={CalendarClock}
            />
            <WorkforceKpiCard
              label="Projected workforce gap"
              value={totals.projectedGap}
              hint="After joiners and people on notice"
              icon={TrendingDown}
              tone={totals.projectedGap > 0 ? "danger" : "success"}
            />
          </div>

          {unplanned.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>
                {unplanned.length} role{unplanned.length > 1 ? "s" : ""} have staff but no
                staffing plan
              </AlertTitle>
              <AlertDescription>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {unplanned.slice(0, 12).map((u: any) => (
                    <Badge key={`${u.department_id}-${u.position_id}`} variant="outline">
                      {u.position_title} · {u.department_name} ({u.current_hc})
                    </Badge>
                  ))}
                </div>
                <Button asChild variant="link" className="mt-1 h-auto p-0">
                  <Link to="/hrms/workforce-planning/staffing-plan">
                    Add their approved and required numbers
                  </Link>
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Hiring action required</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {actionRows.length === 0 ? (
                  <EmptyState
                    icon={UserCheck}
                    title="No hiring needed right now"
                    description="Every planned role is staffed or its remaining shortage is already covered by pipeline and open requirements."
                  />
                ) : (
                  actionRows.map((r) => (
                    <div
                      key={r.plan_id}
                      className="rounded-lg border border-border p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {r.department_name} — {r.position_title}
                            {r.shift_name ? ` · ${r.shift_name} shift` : ""}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Required {r.required_hc} · On roll {r.current_hc} · Approved{" "}
                            {r.approved_hc} · Pipeline {r.pipeline_hc} · Joining{" "}
                            {r.pending_joining_hc} · Open hiring {r.open_requirement_hc} · Target {formatIstDate(r.target_date)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={PRIORITY_CLASS[r.priority]}>
                            {PRIORITY_LABEL[r.priority]}
                          </Badge>
                          <div className="text-right">
                            <span className="block text-lg font-semibold tabular-nums text-destructive">
                              Short {r.staffingGap}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {r.uncoveredHiringRequirement > 0
                                ? `${r.uncoveredHiringRequirement} not requested`
                                : `${r.open_requirement_hc} requested`}
                            </span>
                          </div>
                          {canManage && r.uncoveredHiringRequirement > 0 && (
                            <Button
                              size="sm"
                              onClick={() =>
                                setSeed({
                                  department_id: r.department_id!,
                                  position_id: r.position_id!,
                                  shift_id: r.shift_id,
                                  shift_label: r.shift_name,
                                  location: r.location,
                                  employment_type: r.employment_type,
                                  number_required: r.uncoveredHiringRequirement,
                                  target_joining_date: r.target_date,
                                  priority: r.priority,
                                })
                              }
                            >
                              Create requirement
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Alerts</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {alerts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing needs attention.</p>
                ) : (
                  alerts.map((a) => (
                    <div key={a.key} className="rounded-lg border border-border p-2.5">
                      <p className="truncate text-sm text-foreground">{a.label}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {a.alerts.map((t) => (
                          <Badge key={t} variant="outline" className="text-xs">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Department-wise headcount</CardTitle>
              </CardHeader>
              <CardContent className="h-[300px]">
                {deptChart.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Add staffing lines to see this comparison.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={deptChart} margin={{ top: 8, right: 8, bottom: 8, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11 }}
                        interval={0}
                        angle={-20}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <ChartTooltip />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="current" name="On roll" fill="hsl(var(--primary))" radius={3} />
                      <Bar dataKey="required" name="Required" fill="hsl(var(--chart-2, 200 80% 50%))" radius={3} />
                      <Bar dataKey="approved" name="Approved" fill="hsl(var(--muted-foreground))" radius={3} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Shift-wise staffing</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {shiftRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No shift plans yet.</p>
                ) : (
                  shiftRows.map((s) => {
                    const gap = s.required - s.current;
                    return (
                      <div
                        key={s.shift}
                        className="flex items-center justify-between rounded-lg border border-border p-2.5"
                      >
                        <div>
                          <p className="text-sm font-medium text-foreground">{s.shift}</p>
                          <p className="text-xs text-muted-foreground">
                            Required {s.required} · On roll {s.current}
                          </p>
                        </div>
                        <span
                          className={
                            gap > 0
                              ? "text-sm font-semibold text-destructive"
                              : gap < 0
                                ? "text-sm font-semibold text-amber-600"
                                : "text-sm font-semibold text-emerald-600"
                          }
                        >
                          {gap > 0 ? `short ${gap}` : gap < 0 ? `over ${Math.abs(gap)}` : "balanced"}
                        </span>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <HiringRequirementDialog
        open={!!seed}
        onOpenChange={(o) => !o && setSeed(null)}
        initial={seed ?? undefined}
      />
    </div>
  );
}
