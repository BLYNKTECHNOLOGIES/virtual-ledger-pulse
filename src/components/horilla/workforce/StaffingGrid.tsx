import { formatInr, type BudgetLine } from "@/hooks/hrms/useWorkforceBudget";
import { Link } from "react-router-dom";
import { Armchair, GraduationCap, PauseCircle, Plus, UserMinus } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  formatIstDate, lineTone, lineToneLabel, pauseText, planningShiftId, planningShifts, rotaOrder,
  type PlanningShiftLike, type StaffingDerived,
} from "@/lib/hrms/workforce";
import { seatRoleIds } from "@/hooks/hrms/useWorkforceAlerts";
import { DesignationLinks } from "./DesignationStory";

export interface GridColumn { id: string; name: string }
export interface GridRow {
  key: string;
  departmentId: string | null;
  departmentName: string;
  roleLabel: string;
  roleIds: string[];
  /** Title of each of roleIds ("" when unknown). */
  roleTitles: string[];
  seat: any | null;
  cells: Map<string, StaffingDerived>;
  notice: number;
  trainees: number;
}

/** Rows = desk groups / roles, columns = planning shifts in rota order (training shifts never). */
export function buildStaffingGrid(
  rows: StaffingDerived[],
  plans: any[],
  seats: any[],
  shifts: PlanningShiftLike[],
  unplanned: any[],
  title: (id: string) => string | undefined,
): { columns: GridColumn[]; rows: GridRow[] } {
  const planById = new Map(plans.map((p) => [p.id, p]));
  const seatById = new Map(seats.map((s) => [s.id, s]));
  const used = new Set<string>();
  const out = new Map<string, GridRow>();

  for (const r of rows) {
    const plan = planById.get(r.plan_id);
    const roleIds: string[] = plan?.eligible_position_ids?.length ? plan.eligible_position_ids : r.position_id ? [r.position_id] : [];
    const col = planningShiftId(shifts, plan?.shift_id ?? r.shift_id) ?? (plan?.eligible_shift_ids?.[0] ? planningShiftId(shifts, plan.eligible_shift_ids[0])! : "any");
    used.add(col);
    // Role set is always part of the key: two roles sharing one desk group must not overwrite each other.
    const key = `${r.seat_capacity_id ? `seat:${r.seat_capacity_id}` : `dept:${r.department_id}`}:${[...roleIds].sort().join(",")}`;
    let row = out.get(key);
    if (!row) {
      row = {
        key,
        departmentId: r.department_id,
        departmentName: r.department_name || "No department",
        roleLabel: roleIds.map(title).filter(Boolean).join(" / ") || r.position_title || "Designation",
        roleIds,
        roleTitles: roleIds.map((id) => title(id) ?? ""),
        seat: r.seat_capacity_id ? seatById.get(r.seat_capacity_id) ?? null : null,
        cells: new Map(),
        notice: 0,
        trainees: 0,
      };
      out.set(key, row);
    }
    row.cells.set(col, r);
    row.notice += r.notice_period_hc;
    row.trainees += r.in_training_hc;
  }
  unplanned.forEach((u) => u.shift_id && used.add(planningShiftId(shifts, u.shift_id)!));

  const columns: GridColumn[] = rotaOrder(planningShifts(shifts) as any[])
    .filter((s: any) => used.has(s.id))
    .map((s: any) => ({ id: s.id, name: s.name }));
  if (used.has("any")) columns.push({ id: "any", name: "Any shift" });

  const list = Array.from(out.values()).sort(
    (a, b) => a.departmentName.localeCompare(b.departmentName) || a.roleLabel.localeCompare(b.roleLabel),
  );
  return { columns, rows: list };
}

/** The row's designation name(s), each opening its journey. */
export function RoleLinks({ row }: { row: GridRow }) {
  const titles = new Map(row.roleIds.map((id, i) => [id, row.roleTitles?.[i] || ""]));
  if (!row.roleIds.some((id) => titles.get(id))) return <>{row.roleLabel}</>;
  return <DesignationLinks ids={row.roleIds} titleOf={(id) => titles.get(id) || undefined} />;
}

interface Props {
  columns: GridColumn[];
  rows: GridRow[];
  canManage: boolean;
  onOpenLine: (line: StaffingDerived, roleLabel: string) => void;
  onPlanCell: (row: GridRow, columnId: string) => void;
  /** Monthly cost per line (HRMS managers, "Show cost" on). */
  costs?: Map<string, BudgetLine>;
}

const TONE_TEXT = { short: "text-destructive", met: "text-success", over: "text-warning", covered: "text-primary" } as const;
const TONE_BG = { short: "bg-destructive/[0.06] hover:bg-destructive/10", met: "hover:bg-muted/60", over: "bg-warning/[0.08] hover:bg-warning/15", covered: "bg-primary/[0.06] hover:bg-primary/10" } as const;

function CellTip({ r }: { r: StaffingDerived }) {
  return (
    <div className="space-y-0.5 text-xs">
      <p className="font-medium">{r.current_hc} on roll of {r.required_hc} required</p>
      {(r.selected_hc > 0 || r.pending_joining_hc > 0) && <p>Joining {r.selected_hc + r.pending_joining_hc}{r.selected_hc ? ` (${r.selected_hc} without a joining date)` : ""}</p>}
      {r.in_training_hc > 0 && <p>In training {r.in_training_hc}{r.training_ready_date ? ` (ready ${formatIstDate(r.training_ready_date)})` : ""}</p>}
      <p>In hiring {r.open_requirement_hc}{r.open_requirement_count ? ` in ${r.open_requirement_count} request${r.open_requirement_count === 1 ? "" : "s"}` : ""}</p>
      {r.over_requested_hc > 0 && <p className="text-warning">Over-requested by {r.over_requested_hc}</p>}
      {r.netHiringRequirement > 0 && <p>Still to find {r.netHiringRequirement} · not requested yet {r.uncoveredHiringRequirement}</p>}
      {r.follow_desks && <p className="text-muted-foreground">Follows its desk group</p>}
      {pauseText(r) && <p className="text-warning">{pauseText(r)}</p>}
    </div>
  );
}

const sum = (cells: StaffingDerived[]) => cells.reduce(
  (a, r) => ({ cur: a.cur + r.current_hc, req: a.req + r.required_hc, short: a.short + Math.max(0, r.staffingGap), over: a.over + Math.max(0, -r.staffingGap) }),
  { cur: 0, req: 0, short: 0, over: 0 },
);

function Totals({ t, strong }: { t: ReturnType<typeof sum>; strong?: boolean }) {
  return (
    <span className="inline-flex flex-col items-center leading-tight">
      <span className={cn("tabular-nums text-foreground", strong ? "text-sm font-semibold" : "text-sm")}>{t.cur} / {t.req}</span>
      <span className={cn("text-[10px] font-medium", t.short ? "text-destructive" : t.over ? "text-warning" : "text-success")}>
        {t.short ? `short ${t.short}` : t.over ? `${t.over} extra` : "met"}{t.short && t.over ? ` · ${t.over} extra` : ""}
      </span>
    </span>
  );
}

export function StaffingGrid({ columns, rows, canManage, onOpenLine, onPlanCell, costs }: Props) {
  const departments = Array.from(new Set(rows.map((r) => r.departmentName)));
  const all = rows.flatMap((r) => Array.from(r.cells.values()));
  return (
    <TooltipProvider delayDuration={150}>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[720px] table-fixed text-sm">
          <colgroup>
            <col className="w-[30%]" />
            {columns.map((c) => <col key={c.id} />)}
            <col className="w-24" />
          </colgroup>
          <thead className="border-b border-border bg-muted/40">
            <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-medium">Designation</th>
              {columns.map((c) => <th key={c.id} className="truncate px-2 py-2 text-center font-medium" title={c.name}>{c.name.replace(/ Shift$/, "")}</th>)}
              <th className="px-2 py-2 text-center font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {departments.map((dept) => {
              const deptRows = rows.filter((r) => r.departmentName === dept);
              return (
                <DeptRows key={dept} dept={dept} rows={deptRows} columns={columns} canManage={canManage}
                  onOpenLine={onOpenLine} onPlanCell={onPlanCell} costs={costs} />
              );
            })}
          </tbody>
          <tfoot className="border-t border-border bg-muted/30">
            <tr>
              <td className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">All lines</td>
              {columns.map((c) => {
                const cells = rows.map((r) => r.cells.get(c.id)).filter(Boolean) as StaffingDerived[];
                return <td key={c.id} className="px-2 py-2 text-center">{cells.length ? <Totals t={sum(cells)} /> : null}</td>;
              })}
              <td className="px-2 py-2 text-center"><Totals t={sum(all)} strong /></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </TooltipProvider>
  );
}

function DeptRows({ dept, rows, columns, canManage, onOpenLine, onPlanCell, costs }: Props & { dept: string }) {
  const t = sum(rows.flatMap((r) => Array.from(r.cells.values())));
  return (
    <>
      <tr className="border-b border-border bg-muted/20">
        <td colSpan={columns.length + 1} className="px-3 py-1.5 text-xs font-semibold text-foreground">{dept}</td>
        <td className="px-2 py-1.5 text-center text-[11px] tabular-nums text-muted-foreground">
          {t.cur} / {t.req}{t.short ? <span className="ml-1 text-destructive">−{t.short}</span> : null}
        </td>
      </tr>
      {rows.map((row) => {
        const cells = Array.from(row.cells.values());
        const follows = cells.some((r) => r.follow_desks);
        return (
          <tr key={row.key} className="group border-b border-border/60 last:border-0">
            <td className="px-3 py-2 align-middle">
              <p className="truncate font-medium text-foreground" title={row.roleLabel}><RoleLinks row={row} /></p>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-muted-foreground">
                {row.seat ? (
                  <Link to="/hrms/workforce-planning/capacity-seats" className="inline-flex items-center gap-1 hover:text-primary" title="Desk group">
                    <Armchair className="h-3 w-3 shrink-0" /> {row.seat.physical_seats} desk{row.seat.physical_seats === 1 ? "" : "s"}{follows ? " · follows desks" : ""}
                  </Link>
                ) : (
                  <span>No desk group</span>
                )}
                {row.trainees > 0 && (
                  <span className="inline-flex items-center gap-1 text-primary"><GraduationCap className="h-3 w-3 shrink-0" /> {row.trainees} in training</span>
                )}
                {row.notice > 0 && (
                  <span className="inline-flex items-center gap-1 text-warning"><UserMinus className="h-3 w-3 shrink-0" /> {row.notice} on notice</span>
                )}
                {costs && (() => {
                  const cs = cells.map((r) => costs.get(r.plan_id)).filter(Boolean) as BudgetLine[];
                  const known = cs.filter((c) => c.full_cost != null);
                  const total = known.reduce((a, c) => a + (c.full_cost || 0), 0);
                  return cs.length ? (
                    <span className="font-mono text-foreground" title="Fully staffed, monthly">
                      {formatInr(total)}/mo{known.length < cs.length ? " + in dept. total" : ""}
                    </span>
                  ) : null;
                })()}
              </div>
            </td>
            {columns.map((c) => {
              const r = row.cells.get(c.id);
              if (!r) {
                const coveredByAny = c.id !== "any" && row.cells.has("any");
                return (
                  <td key={c.id} className="px-1.5 py-1.5 text-center align-middle">
                    {coveredByAny ? (
                      <span className="text-[10px] text-muted-foreground">any shift</span>
                    ) : canManage ? (
                      <button type="button" onClick={() => onPlanCell(row, c.id)} aria-label={`Plan ${row.roleLabel} in ${c.name}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground/0 transition-colors hover:bg-muted hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:text-muted-foreground/60 [@media(hover:none)]:text-muted-foreground/50">
                        <Plus className="h-4 w-4" />
                      </button>
                    ) : (
                      <span className="text-muted-foreground/40">·</span>
                    )}
                  </td>
                );
              }
              const tone = lineTone(r);
              const idle = r.required_hc === 0 && r.current_hc === 0;
              const cost = costs?.get(r.plan_id);
              return (
                <td key={c.id} className="px-1.5 py-1.5 text-center align-middle">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" onClick={() => onOpenLine(r, row.roleLabel)}
                        className={cn("w-full rounded-md px-1.5 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          idle ? "hover:bg-muted/60" : TONE_BG[tone])}
                        aria-label={`${row.roleLabel} ${c.name}: ${idle ? "not staffed in this shift" : `${r.current_hc} on roll of ${r.required_hc} required, ${lineToneLabel(r)}`}`}>
                        {idle ? (
                          <span className="block text-sm text-muted-foreground/60">—</span>
                        ) : (
                          <>
                            <span className="block text-sm font-semibold tabular-nums text-foreground">{r.current_hc} / {r.required_hc}</span>
                            <span className={cn("mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium", TONE_TEXT[tone])}>
                              {lineToneLabel(r)}
                              {r.auto_paused_at && <PauseCircle className="h-3 w-3 text-warning" aria-label="Hiring held back" />}
                            </span>
                          </>
                        )}
                        {cost && (
                          <span className="block font-mono text-[10px] text-muted-foreground">
                            {cost.full_cost != null ? `${formatInr(cost.full_cost)}/mo` : "in dept. total"}
                          </span>
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">{idle ? <p className="text-xs">Not staffed in this shift (0 required). Open to change.</p> : <CellTip r={r} />}</TooltipContent>
                  </Tooltip>
                </td>
              );
            })}
            <td className="px-1.5 py-1.5 text-center align-middle"><Totals t={sum(cells)} /></td>
          </tr>
        );
      })}
    </>
  );
}

export { seatRoleIds };
