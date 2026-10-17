import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ClipboardList, History, LayoutGrid, List, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { TableSkeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/hooks/usePermissions";
import { BUDGET_SOURCE_LABEL, useWorkforceBudget } from "@/hooks/hrms/useWorkforceBudget";
import { HiringRequirementDialog } from "@/components/horilla/workforce/HiringRequirementDialog";
import { AddLineDialog, type AddLineSeed } from "@/components/horilla/workforce/AddLineDialog";
import { LinePanel } from "@/components/horilla/workforce/LinePanel";
import { PlanHistoryDrawer } from "@/components/horilla/workforce/PlanHistoryDrawer";
import { StaffingGrid, buildStaffingGrid, type GridRow } from "@/components/horilla/workforce/StaffingGrid";
import { WorkforceAttention } from "@/components/horilla/workforce/WorkforceAttention";
import { seatRoleIds } from "@/hooks/hrms/useWorkforceAlerts";
import { InfoTip } from "@/components/ats/AtsUi";
import {
  useHeadcountPlans, useHiringRequirements, useSeatCapacity, useStaffingMatrix, useUnplannedScopes, useWorkforceLookups,
} from "@/hooks/hrms/useWorkforcePlanning";
import {
  WF_DEFINITIONS, formatIstDate, lineTone, lineToneLabel, planningShiftId, planningShifts, rotaOrder, sumLines, type StaffingDerived,
} from "@/lib/hrms/workforce";
import { cn } from "@/lib/utils";

type View = "grid" | "list";
type StatusFilter = "all" | "understaffed" | "fully_staffed" | "overstaffed";
const TONE_TEXT = { short: "text-destructive", met: "text-success", over: "text-warning", covered: "text-primary" } as const;

const STATUS_PARAM: Record<string, StatusFilter> = {
  understaffed: "understaffed", short: "understaffed", fully_staffed: "fully_staffed", met: "fully_staffed",
  overstaffed: "overstaffed", over: "overstaffed",
};

function readView(): View {
  try { return localStorage.getItem("wf_staffing_view") === "list" ? "list" : "grid"; } catch { return "grid"; }
}

export default function StaffingPlanPage() {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission("hrms_manage");
  const [params, setParams] = useSearchParams();

  const [view, setView] = useState<View>(readView);
  const [dept, setDept] = useState("all");
  const [shift, setShift] = useState("all");
  const [status, setStatus] = useState<StatusFilter>(() => STATUS_PARAM[params.get("status") ?? ""] ?? "all");
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
  const { data: allReqs = [] } = useHiringRequirements();
  // Lines carry no target date of their own today: show the earliest target of their open requests.
  const reqTarget = useMemo(() => {
    const m = new Map<string, string>();
    for (const q of allReqs as any[]) {
      if (!q.staffing_plan_id || !q.target_joining_date) continue;
      if (!["pending_approval", "approved", "recruitment_active", "partially_fulfilled"].includes(q.status)) continue;
      const cur = m.get(q.staffing_plan_id);
      if (!cur || q.target_joining_date < cur) m.set(q.staffing_plan_id, q.target_joining_date);
    }
    return m;
  }, [allReqs]);

  useEffect(() => { try { localStorage.setItem("wf_staffing_view", view); } catch { /* storage unavailable */ } }, [view]);

  const shifts = (lookups?.shifts || []) as any[];
  const orderedShifts = useMemo(() => rotaOrder(planningShifts(shifts)), [shifts]);
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

  // Deep links: ?plan_desk=<seat> and ?plan_role=<position>[&plan_shift=<shift>] open "Add line"; ?line=<plan> opens the panel.
  useEffect(() => {
    const deskId = params.get("plan_desk");
    const lineId = params.get("line");
    const roleId = params.get("plan_role");
    let changed = false;
    if (deskId && seats.length) {
      const s: any = (seats as any[]).find((x) => x.id === deskId);
      if (s) {
        const ids = seatRoleIds(s);
        setAddSeed({ department_id: s.department_id, position_id: ids[0], eligible_position_ids: ids, seat_capacity_id: s.id, multiShift: true });
      }
      params.delete("plan_desk"); changed = true;
    }
    if (roleId && lookups) {
      const role: any = (lookups.positions || []).find((p: any) => p.id === roleId);
      const shiftId = params.get("plan_shift");
      if (role && canManage) {
        setAddSeed(shiftId
          ? { department_id: role.department_id ?? undefined, position_id: role.id, shift_id: planningShiftId(shifts, shiftId) }
          : { department_id: role.department_id ?? undefined, position_id: role.id, multiShift: true });
      }
      params.delete("plan_role"); params.delete("plan_shift"); changed = true;
    }
    if (lineId && rows.length) {
      const r = rows.find((x) => x.plan_id === lineId);
      if (r) setPanel({ planId: r.plan_id, roleLabel: r.position_title || "Role" });
      params.delete("line"); changed = true;
    }
    if (changed) setParams(params, { replace: true });
  }, [params, seats, rows, lookups, shifts, canManage, setParams]);

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
    ...orderedShifts.map((s: any) => ({ id: s.id, name: s.name })),
    ...(rows.some((r) => r.shiftLabel === "Any shift") ? [{ id: "any", name: "Any shift" }] : []),
  ];
  const filtering = dept !== "all" || shift !== "all" || status !== "all" || !!search.trim();

  return (
    <div className="hrms-page space-y-4">
      <PageHeader
        title="Staffing plan"
        description="Every role in every shift: people on roll against what each line requires. Select a cell to see who is counted or to change the line."
        actions={
          <div className={cn("grid w-full gap-2 sm:flex sm:w-auto", canManage && "grid-cols-[repeat(2,minmax(0,1fr))]")}>
            <Button variant="outline" onClick={() => setHistoryOpen(true)}><History className="h-4 w-4" /> History</Button>
            {canManage && <Button onClick={() => setAddSeed({})}><Plus className="h-4 w-4" /> Add line</Button>}
          </div>
        }
      />

      {!matrix.isLoading && rows.length > 0 && (
        <dl className="flex flex-wrap gap-x-6 gap-y-2 rounded-xl border border-border bg-card px-4 py-3 text-sm">
          <Stat label="Required" value={totals.required} sub={`${totals.lines} line${totals.lines === 1 ? "" : "s"}`} info={WF_DEFINITIONS.required} />
          <Stat label="On roll" value={totals.current} info={WF_DEFINITIONS.onRoll} />
          {totals.inTraining > 0 && <Stat label="In training" value={totals.inTraining} />}
          <Stat label="Short now" value={totals.shortNow} tone={totals.shortNow > 0 ? "text-destructive" : "text-success"} info={WF_DEFINITIONS.short} />
          {totals.netNeed !== totals.shortNow && <Stat label="Still needed" value={totals.netNeed} info={WF_DEFINITIONS.netNeed} />}
          {totals.overNow > 0 && <Stat label="Over" value={totals.overNow} tone="text-warning" />}
          <Stat label="Being hired" value={totals.requested} info={WF_DEFINITIONS.beingHired} />
          {totals.uncovered > 0 && <Stat label="Not yet requested" value={totals.uncovered} tone="text-warning" info={WF_DEFINITIONS.notRequested} />}
          {totals.overRequested > 0 && <Stat label="Over-requested" value={totals.overRequested} tone="text-warning" />}
          {filtering && <span className="self-center text-xs text-muted-foreground">for the filtered lines</span>}
        </dl>
      )}

      <WorkforceAttention
        rows={filtered}
        canManage={canManage}
        variant="compact"
        scope={{ departmentId: dept }}
        shiftFiltered={shift !== "all"}
        shift={shift === "all" ? "all" : orderedShifts.find((s: any) => s.id === shift)?.name}
        onOpenLine={openLine}
        onPlanDesks={(s) => {
          const ids = seatRoleIds(s);
          setAddSeed({ department_id: s.department_id, position_id: ids[0], eligible_position_ids: ids, seat_capacity_id: s.id, multiShift: true });
        }}
      />

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="grid flex-1 grid-cols-[repeat(2,minmax(0,1fr))] gap-2 sm:flex sm:flex-wrap sm:items-center">
          <Select value={dept} onValueChange={setDept}>
            <SelectTrigger aria-label="Department" className={cn("h-9 text-foreground sm:w-52", dept !== "all" && "border-primary/50")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {(lookups?.departments || []).map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={shift} onValueChange={setShift}>
            <SelectTrigger aria-label="Shift" className={cn("h-9 text-foreground sm:w-44", shift !== "all" && "border-primary/50")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All shifts</SelectItem>
              {shiftOptions.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative col-span-2 sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="h-9 pl-8 text-foreground" placeholder="Search role or department" aria-label="Search role or department"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <SegmentedControl<StatusFilter>
            aria-label="Staffing status"
            className="col-span-2 w-fit"
            size="sm"
            value={status}
            onValueChange={setStatus}
            options={[
              { value: "all", label: "All" },
              { value: "understaffed", label: "Short" },
              { value: "fully_staffed", label: "Met" },
              { value: "overstaffed", label: "Over" },
            ]}
          />
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 lg:justify-end">
          {canManage && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground" title={BUDGET_SOURCE_LABEL}>
              <Switch checked={showCost} onCheckedChange={setShowCost} /> Show cost
            </label>
          )}
          <div className="hidden md:block">
            <SegmentedControl<View> aria-label="View" size="sm" value={view} onValueChange={setView}
              options={[
                { value: "grid", label: "Grid", icon: <LayoutGrid className="h-3.5 w-3.5" /> },
                { value: "list", label: "List", icon: <List className="h-3.5 w-3.5" /> },
              ]} />
          </div>
        </div>
      </div>

      {matrix.isLoading ? (
        <TableSkeleton />
      ) : matrix.isError && rows.length === 0 ? (
        <ErrorState title="Couldn't load the staffing plan" error={matrix.error} onRetry={() => matrix.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No staffing lines yet"
          description="Add a line for each role and shift. People on roll and the pipeline are counted for you."
          action={canManage ? <Button onClick={() => setAddSeed({})}><Plus className="h-4 w-4" /> Add line</Button> : undefined} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title="No lines match" description="Change or clear the filters to see more lines."
          action={<Button variant="outline" onClick={() => { setDept("all"); setShift("all"); setStatus("all"); setSearch(""); }}>Clear filters</Button>} />
      ) : (
        <>
          <div className={view === "grid" ? "hidden md:block" : "hidden"}>
            <StaffingGrid columns={grid.columns} rows={grid.rows} canManage={canManage}
              onOpenLine={(r, roleLabel) => setPanel({ planId: r.plan_id, roleLabel })} onPlanCell={planCell} costs={costs} />
            <p className="mt-2 text-xs text-muted-foreground">
              Each cell is on roll / required. Trainees count on their line as "in training", not as on roll.
              {costs ? ` Monthly cost if fully staffed. ${BUDGET_SOURCE_LABEL}. Lines with one person on roll are counted only in the department total.` : ""}
            </p>
          </div>

          <div className={view === "list" ? "hidden overflow-x-auto rounded-xl border border-border bg-card md:block" : "hidden"}>
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-border bg-muted/40">
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Line</th>
                  <th className="px-2 py-2 text-right font-medium">On roll / req.</th>
                  <th className="hidden px-2 py-2 text-right font-medium xl:table-cell">Approved</th>
                  <th className="px-2 py-2 text-right font-medium">In training</th>
                  <th className="px-2 py-2 text-right font-medium">Joining</th>
                  <th className="px-2 py-2 text-right font-medium">Candidates</th>
                  <th className="px-2 py-2 text-right font-medium">Being hired</th>
                  <th className="px-2 py-2 text-right font-medium">Still needed</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="hidden px-3 py-2 font-medium lg:table-cell">Target joining</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const tone = lineTone(r);
                  const openLine = () => setPanel({ planId: r.plan_id, roleLabel: r.position_title || "Role" });
                  return (
                    <tr key={r.plan_id} className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-muted/30 focus-within:bg-muted/30"
                      onClick={openLine}>
                      <td className="px-3 py-2">
                        <button type="button" onClick={(e) => { e.stopPropagation(); openLine(); }}
                          className="rounded-sm text-left font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          {r.position_title} · {r.shiftLabel}
                        </button>
                        <p className="text-xs text-muted-foreground">{r.department_name}{r.follow_desks ? " · follows desks" : ""}</p>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{r.current_hc} / {r.required_hc}</td>
                      <td className="hidden px-2 py-2 text-right tabular-nums xl:table-cell">{r.approved_hc}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{r.in_training_hc || "—"}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{r.selected_hc + r.pending_joining_hc || "—"}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{r.pipeline_hc || "—"}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{r.open_requirement_hc || "—"}</td>
                      <td className="px-2 py-2 text-right font-semibold tabular-nums">
                        {r.netHiringRequirement || "—"}
                        {r.uncoveredHiringRequirement > 0 && <span className="ml-1 text-xs font-normal text-warning">({r.uncoveredHiringRequirement} not requested)</span>}
                      </td>
                      <td className={cn("px-3 py-2 text-xs font-medium", r.required_hc === 0 && r.current_hc === 0 ? "text-muted-foreground" : TONE_TEXT[tone])}>
                        {r.required_hc === 0 && r.current_hc === 0 ? "not staffed" : lineToneLabel(r)}
                      </td>
                      <td className="hidden px-3 py-2 text-xs text-muted-foreground lg:table-cell">
                        {r.target_date ? formatIstDate(r.target_date) : reqTarget.get(r.plan_id) ? formatIstDate(reqTarget.get(r.plan_id)!) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <MobileLines rows={grid.rows} columns={grid.columns} onOpen={(r, roleLabel) => setPanel({ planId: r.plan_id, roleLabel })} />
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

function Stat({ label, value, sub, tone, info }: { label: string; value: number; sub?: string; tone?: string; info?: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="inline-flex items-center gap-1 text-xs text-muted-foreground">{label}{info && <InfoTip label={label} text={info} />}</dt>
      <dd className={cn("font-semibold tabular-nums text-foreground", tone)}>{value}</dd>
      {sub && <dd className="text-xs text-muted-foreground">({sub})</dd>}
    </div>
  );
}

/** Phones: one card per role with a chip per shift; tap a chip to open that line. */
function MobileLines({ rows, columns, onOpen }: { rows: GridRow[]; columns: { id: string; name: string }[]; onOpen: (r: StaffingDerived, roleLabel: string) => void }) {
  const departments = Array.from(new Set(rows.map((r) => r.departmentName)));
  return (
    <div className="space-y-4 md:hidden">
      {departments.map((d) => (
        <section key={d} className="space-y-2" aria-label={d}>
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{d}</h2>
          {rows.filter((r) => r.departmentName === d).map((row) => {
            const cells = columns.map((c) => ({ c, r: row.cells.get(c.id) })).filter((x) => !!x.r) as { c: { id: string; name: string }; r: StaffingDerived }[];
            return (
              <div key={row.key} className="rounded-xl border border-border bg-card p-3">
                <p className="font-medium text-foreground">{row.roleLabel}</p>
                <p className="text-xs text-muted-foreground">
                  {row.seat ? `${row.seat.physical_seats} desk${row.seat.physical_seats === 1 ? "" : "s"}` : "No desk group"}
                  {row.trainees ? ` · ${row.trainees} in training` : ""}{row.notice ? ` · ${row.notice} on notice` : ""}
                </p>
                <div className="mt-2 grid grid-cols-[repeat(2,minmax(0,1fr))] gap-1.5">
                  {cells.map(({ c, r }) => {
                    const idle = r.required_hc === 0 && r.current_hc === 0;
                    const tone = lineTone(r);
                    return (
                      <div key={c.id} role="button" tabIndex={0} onClick={() => onOpen(r, row.roleLabel)}
                        aria-label={`${row.roleLabel} ${c.name}: ${idle ? "not staffed" : `${r.current_hc} of ${r.required_hc}, ${lineToneLabel(r)}`}`}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(r, row.roleLabel); } }}
                        className="cursor-pointer rounded-lg border border-border px-2.5 py-1.5 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <p className="truncate text-[11px] text-muted-foreground">{c.name.replace(/ Shift$/, "")}</p>
                        <p className="text-sm tabular-nums">
                          {idle ? <span className="text-muted-foreground">not staffed</span> : (
                            <>
                              <span className="font-semibold text-foreground">{r.current_hc} / {r.required_hc}</span>
                              <span className={cn("ml-1.5 text-[11px] font-medium", TONE_TEXT[tone])}>{lineToneLabel(r)}</span>
                            </>
                          )}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
