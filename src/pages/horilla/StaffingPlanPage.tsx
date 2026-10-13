import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ClipboardList, History, LayoutGrid, List, Plus, Search, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { TableSkeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/hooks/usePermissions";
import { Switch } from "@/components/ui/switch";
import { BUDGET_SOURCE_LABEL, useWorkforceBudget } from "@/hooks/hrms/useWorkforceBudget";
import { WorkforceKpiCard } from "@/components/horilla/workforce/WorkforceKpiCard";
import { HiringRequirementDialog } from "@/components/horilla/workforce/HiringRequirementDialog";
import { AddLineDialog, type AddLineSeed } from "@/components/horilla/workforce/AddLineDialog";
import { LinePanel } from "@/components/horilla/workforce/LinePanel";
import { PlanHistoryDrawer } from "@/components/horilla/workforce/PlanHistoryDrawer";
import { StaffingGrid, buildStaffingGrid, type GridRow } from "@/components/horilla/workforce/StaffingGrid";
import { WorkforceAlertsStrip } from "@/components/horilla/workforce/WorkforceAlertsStrip";
import { seatRoleIds } from "@/hooks/hrms/useWorkforceAlerts";
import {
  useHeadcountPlans, useSeatCapacity, useStaffingMatrix, useUnplannedScopes, useWorkforceLookups,
} from "@/hooks/hrms/useWorkforcePlanning";
import {
  GAP_CHIP_CLASS, PRIORITY_CLASS, PRIORITY_LABEL, STATUS_FILTER_OPTIONS, formatIstDate, gapLabel, gapTone,
  planningShiftId, planningShifts, sumLines, type StaffingDerived,
} from "@/lib/hrms/workforce";

type View = "grid" | "list";

export default function StaffingPlanPage() {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission("hrms_manage");
  const [params, setParams] = useSearchParams();

  const [view, setView] = useState<View>(() => (localStorage.getItem("wf_staffing_view") as View) || "grid");
  const [dept, setDept] = useState("all");
  const [shift, setShift] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [showCost, setShowCost] = useState(false);
  const budget = useWorkforceBudget(canManage && showCost);
  const costs = useMemo(() => (showCost && budget.data ? new Map(budget.data.lines.map((l) => [l.plan_id, l])) : undefined), [showCost, budget.data]);
  const [addSeed, setAddSeed] = useState<AddLineSeed | null>(null);
  const [panel, setPanel] = useState<{ planId: string; roleLabel: string } | null>(null);
  const [reqSeed, setReqSeed] = useState<any | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const matrix = useStaffingMatrix();
  const { rows } = matrix;
  const { data: lookups } = useWorkforceLookups();
  const { data: plans = [] } = useHeadcountPlans();
  const { data: seats = [] } = useSeatCapacity();
  const { data: unplanned = [] } = useUnplannedScopes();

  useEffect(() => localStorage.setItem("wf_staffing_view", view), [view]);

  const shifts = (lookups?.shifts || []) as any[];
  const title = (id: string) => (lookups?.positions || []).find((p) => p.id === id)?.title;
  const planById = useMemo(() => new Map((plans as any[]).map((p) => [p.id, p])), [plans]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (dept !== "all" && r.department_id !== dept) return false;
      if (shift !== "all") {
        const plan = planById.get(r.plan_id);
        const col = planningShiftId(shifts, plan?.shift_id ?? r.shift_id) ?? "any";
        if (col !== shift) return false;
      }
      if (status !== "all" && r.status !== status) return false;
      if (q && ![r.position_title, r.department_name, r.shiftLabel].some((v) => (v || "").toLowerCase().includes(q))) return false;
      return true;
    });
  }, [rows, dept, shift, status, search, planById, shifts]);

  const grid = useMemo(
    () => buildStaffingGrid(filtered, plans as any[], seats as any[], shifts, shift === "all" && dept === "all" && !search ? (unplanned as any[]) : [], title),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, plans, seats, shifts, unplanned, lookups?.positions],
  );
  const totals = useMemo(() => sumLines(filtered), [filtered]);

  // Deep links: ?plan_desk=<seat id> opens the add-line dialog; ?line=<plan id> opens the panel.
  useEffect(() => {
    const deskId = params.get("plan_desk");
    const lineId = params.get("line");
    if (deskId && seats.length) {
      const s: any = (seats as any[]).find((x) => x.id === deskId);
      if (s) {
        const ids = seatRoleIds(s);
        setAddSeed({ department_id: s.department_id, position_id: ids[0], eligible_position_ids: ids, seat_capacity_id: s.id, multiShift: true });
      }
      params.delete("plan_desk");
      setParams(params, { replace: true });
    }
    if (lineId && rows.length) {
      const r = rows.find((x) => x.plan_id === lineId);
      if (r) setPanel({ planId: r.plan_id, roleLabel: r.position_title || "Role" });
      params.delete("line");
      setParams(params, { replace: true });
    }
  }, [params, seats, rows, setParams]);

  const panelLine = panel ? rows.find((r) => r.plan_id === panel.planId) ?? null : null;

  const hire = (r: StaffingDerived) =>
    setReqSeed({
      department_id: r.department_id!,
      position_id: r.position_id!,
      shift_id: r.shift_id,
      shift_label: r.shiftLabel === "Any shift" ? null : r.shiftLabel,
      employment_type: r.employment_type,
      number_required: r.uncoveredHiringRequirement,
      target_joining_date: r.target_date,
      priority: r.priority,
      staffing_plan_id: r.plan_id,
    });

  const planCell = (row: GridRow, columnId: string) =>
    setAddSeed({
      department_id: row.departmentId ?? undefined,
      position_id: row.roleIds[0],
      eligible_position_ids: row.roleIds,
      shift_id: columnId === "any" ? null : columnId,
      seat_capacity_id: row.seat?.id ?? null,
    });

  const openLine = (planId: string) => {
    const r = rows.find((x) => x.plan_id === planId);
    if (r) setPanel({ planId, roleLabel: r.position_title || "Role" });
  };

  const shiftOptions = [
    ...planningShifts(shifts).map((s: any) => ({ id: s.id, name: s.name })),
    ...(rows.some((r) => r.shiftLabel === "Any shift") ? [{ id: "any", name: "Any shift" }] : []),
  ];

  return (
    <div className="space-y-4 p-3 md:p-6">
      <PageHeader
        title="Staffing plan"
        description="Every role in every shift: people on roll against what is required. Click a cell to see who is counted and change the plan."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setHistoryOpen(true)}><History className="h-4 w-4" /> History</Button>
            {canManage && <Button onClick={() => setAddSeed({})}><Plus className="h-4 w-4" /> Add line</Button>}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <WorkforceKpiCard label="Required" value={totals.required} hint={`${totals.lines} lines`} />
        <WorkforceKpiCard label="On roll" value={totals.current} hint="Planned roles only" />
        <WorkforceKpiCard label="In training" value={totals.inTraining} hint={totals.nextReadyDate ? `Next ready ${formatIstDate(totals.nextReadyDate)}` : undefined} />
        <WorkforceKpiCard label="Short now" value={totals.shortNow} tone={totals.shortNow > 0 ? "danger" : "success"} hint="Sum of each line's shortage" />
        <WorkforceKpiCard label="Requested" value={totals.requested} hint="People in open requirements" />
        <WorkforceKpiCard label="Over-requested" value={totals.overRequested} tone={totals.overRequested > 0 ? "warning" : "default"} />
      </div>

      <WorkforceAlertsStrip
        rows={rows}
        positionTitle={title}
        canManage={canManage}
        onOpenLine={openLine}
        onPlanDesks={(s) => {
          const ids = seatRoleIds(s);
          setAddSeed({ department_id: s.department_id, position_id: ids[0], eligible_position_ids: ids, seat_capacity_id: s.id, multiShift: true });
        }}
      />

      <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 lg:flex-row lg:items-center">
        <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Select value={dept} onValueChange={setDept}>
            <SelectTrigger className="h-9 text-foreground"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {(lookups?.departments || []).map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={shift} onValueChange={setShift}>
            <SelectTrigger className="h-9 text-foreground"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All shifts</SelectItem>
              {shiftOptions.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 text-foreground"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Short, met and over</SelectItem>
              {STATUS_FILTER_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="h-9 pl-8 text-foreground" placeholder="Search role or department" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        {canManage && (
          <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground" title={BUDGET_SOURCE_LABEL}>
            <Switch checked={showCost} onCheckedChange={setShowCost} /> Show cost
          </label>
        )}
        <div className="hidden shrink-0 gap-1 md:flex" role="group" aria-label="View">
          <Button size="sm" variant={view === "grid" ? "secondary" : "ghost"} onClick={() => setView("grid")} aria-label="Grid view"><LayoutGrid className="h-4 w-4" /></Button>
          <Button size="sm" variant={view === "list" ? "secondary" : "ghost"} onClick={() => setView("list")} aria-label="List view"><List className="h-4 w-4" /></Button>
        </div>
      </div>

      {matrix.isLoading ? (
        <TableSkeleton />
      ) : matrix.isError ? (
        <ErrorState title="Couldn't load the staffing plan" description={(matrix.error as any)?.message} onRetry={() => matrix.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No staffing lines yet" description="Add a line for each role and shift. People on roll and the pipeline are counted for you." />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title="No lines match" description="Change or clear the filters to see more lines." />
      ) : (
        <>
          <div className={view === "grid" ? "hidden md:block" : "hidden"}>
            <StaffingGrid columns={grid.columns} rows={grid.rows} canManage={canManage}
              onOpenLine={(r, roleLabel) => setPanel({ planId: r.plan_id, roleLabel })} onPlanCell={planCell} costs={costs} />
            {costs && <p className="mt-1 text-xs text-muted-foreground">Monthly cost if fully staffed. {BUDGET_SOURCE_LABEL}. Lines with one person on roll are counted only in the department total.</p>}
          </div>

          <Card className={view === "list" ? "hidden md:block" : "hidden"}>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/40">
                  <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2">Role · shift</th>
                    <th className="px-2 py-2 text-right">On roll / req.</th>
                    <th className="px-2 py-2 text-right">Approved</th>
                    <th className="px-2 py-2 text-right">Training</th>
                    <th className="px-2 py-2 text-right">Pipeline</th>
                    <th className="px-2 py-2 text-right">Net need</th>
                    <th className="px-2 py-2 text-right">Requested</th>
                    <th className="px-2 py-2 text-right">Not requested</th>
                    <th className="px-2 py-2">Target</th>
                    <th className="px-2 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.plan_id} className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-muted/30"
                      onClick={() => setPanel({ planId: r.plan_id, roleLabel: r.position_title || "Role" })}>
                      <td className="px-3 py-2">
                        <p className="font-medium text-foreground">{r.position_title} · {r.shiftLabel}</p>
                        <p className="text-xs text-muted-foreground">{r.department_name}{r.follow_desks ? " · follows desks" : ""}</p>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{r.current_hc} / {r.required_hc}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{r.approved_hc}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{r.in_training_hc}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{r.pipeline_hc}</td>
                      <td className="px-2 py-2 text-right font-semibold tabular-nums">{r.netHiringRequirement}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{r.open_requirement_hc}</td>
                      <td className="px-2 py-2 text-right font-semibold tabular-nums text-destructive">{r.uncoveredHiringRequirement || ""}</td>
                      <td className="px-2 py-2 text-xs text-muted-foreground">{formatIstDate(r.target_date)}</td>
                      <td className="px-2 py-2">
                        <Badge variant="outline" className={GAP_CHIP_CLASS[gapTone(r.staffingGap)]}>{gapLabel(r.staffingGap)}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <div className="space-y-2 md:hidden">
            {filtered.map((r) => (
              <Card key={r.plan_id} onClick={() => setPanel({ planId: r.plan_id, roleLabel: r.position_title || "Role" })} className="cursor-pointer">
                <CardContent className="space-y-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{r.position_title}</p>
                      <p className="text-xs text-muted-foreground">{r.department_name} · {r.shiftLabel}</p>
                    </div>
                    <Badge variant="outline" className={GAP_CHIP_CLASS[gapTone(r.staffingGap)]}>{gapLabel(r.staffingGap)}</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div><p className="text-muted-foreground">On roll</p><p className="font-semibold text-foreground">{r.current_hc} / {r.required_hc}</p></div>
                    <div><p className="text-muted-foreground">Net need</p><p className="font-semibold text-foreground">{r.netHiringRequirement}</p></div>
                    <div><p className="text-muted-foreground">Requested</p><p className="font-semibold text-foreground">{r.open_requirement_hc}</p></div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline" className={PRIORITY_CLASS[r.priority]}>{PRIORITY_LABEL[r.priority]}</Badge>
                    {canManage && r.uncoveredHiringRequirement > 0 && (
                      <Button size="sm" onClick={(e) => { e.stopPropagation(); hire(r); }}>
                        <UserPlus className="h-3.5 w-3.5" /> Hire {r.uncoveredHiringRequirement}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <AddLineDialog open={!!addSeed} onOpenChange={(o) => !o && setAddSeed(null)} seed={addSeed ?? undefined} />
      <LinePanel line={panelLine} roleLabel={panel?.roleLabel ?? ""} canManage={canManage}
        onOpenChange={(o) => !o && setPanel(null)} onHire={hire} />
      <HiringRequirementDialog open={!!reqSeed} onOpenChange={(o) => !o && setReqSeed(null)} initial={reqSeed ?? undefined} />
      <PlanHistoryDrawer open={historyOpen} onOpenChange={setHistoryOpen} />
    </div>
  );
}
