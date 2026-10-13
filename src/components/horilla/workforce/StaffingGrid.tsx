import { formatInr, type BudgetLine } from "@/hooks/hrms/useWorkforceBudget";
import { Link } from "react-router-dom";
import { Armchair, GraduationCap, PauseCircle, Plus, UserMinus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  GAP_CHIP_CLASS, formatIstDate, gapLabel, gapTone, pauseText, planningShiftId, planningShifts,
  type PlanningShiftLike, type StaffingDerived,
} from "@/lib/hrms/workforce";
import { seatRoleIds } from "@/hooks/hrms/useWorkforceAlerts";

export interface GridColumn { id: string; name: string }
export interface GridRow {
  key: string;
  departmentId: string | null;
  departmentName: string;
  roleLabel: string;
  roleIds: string[];
  seat: any | null;
  cells: Map<string, StaffingDerived>;
  notice: number;
  trainees: number;
}

/** Rows = desk groups / roles, columns = planning shifts (training shifts never). */
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
        roleLabel: roleIds.map(title).filter(Boolean).join(" / ") || r.position_title || "Role",
        roleIds,
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

  const columns: GridColumn[] = planningShifts(shifts)
    .filter((s) => used.has(s.id))
    .map((s) => ({ id: s.id, name: s.name }));
  if (used.has("any")) columns.push({ id: "any", name: "Any shift" });

  const list = Array.from(out.values()).sort(
    (a, b) => a.departmentName.localeCompare(b.departmentName) || a.roleLabel.localeCompare(b.roleLabel),
  );
  return { columns, rows: list };
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

function CellTip({ r }: { r: StaffingDerived }) {
  return (
    <div className="space-y-0.5 text-xs">
      <p>Approved {r.approved_hc} · Required {r.required_hc}</p>
      <p>Selected {r.selected_hc} · Joining {r.pending_joining_hc}</p>
      <p>In training {r.in_training_hc}{r.training_ready_date ? ` (ready ${formatIstDate(r.training_ready_date)})` : ""}</p>
      <p>Open requests {r.open_requirement_hc}{r.open_requirement_count ? ` in ${r.open_requirement_count}` : ""}</p>
      {r.over_requested_hc > 0 && <p>Over-requested {r.over_requested_hc}</p>}
      <p>Net need {r.netHiringRequirement} · Not yet requested {r.uncoveredHiringRequirement}</p>
      {pauseText(r) && <p className="text-warning">{pauseText(r)}</p>}
    </div>
  );
}

export function StaffingGrid({ columns, rows, canManage, onOpenLine, onPlanCell, costs }: Props) {
  const departments = Array.from(new Set(rows.map((r) => r.departmentName)));
  return (
    <TooltipProvider delayDuration={150}>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-[34%]" />
            {columns.map((c) => <col key={c.id} />)}
          </colgroup>
          <thead className="border-b border-border bg-muted/40">
            <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2">Role / desks</th>
              {columns.map((c) => <th key={c.id} className="truncate px-2 py-2 text-center" title={c.name}>{c.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {departments.map((dept) => (
              <DeptRows key={dept} dept={dept} rows={rows.filter((r) => r.departmentName === dept)} columns={columns}
                canManage={canManage} onOpenLine={onOpenLine} onPlanCell={onPlanCell} costs={costs} />
            ))}
          </tbody>
        </table>
      </div>
    </TooltipProvider>
  );
}

function DeptRows({ dept, rows, columns, canManage, onOpenLine, onPlanCell, costs }: Props & { dept: string }) {
  return (
    <>
      <tr className="border-b border-border bg-muted/20">
        <td colSpan={columns.length + 1} className="px-3 py-1.5 text-xs font-semibold text-foreground">{dept}</td>
      </tr>
      {rows.map((row) => (
        <tr key={row.key} className="border-b border-border/60 last:border-0">
          <td className="px-3 py-2 align-top">
            <p className="truncate font-medium text-foreground" title={row.roleLabel}>{row.roleLabel}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
              {row.seat ? (
                <Link to="/hrms/workforce-planning/capacity-seats" className="inline-flex items-center gap-1 hover:text-primary">
                  <Armchair className="h-3 w-3 shrink-0" /> {row.seat.physical_seats} desks
                </Link>
              ) : (
                <span>No desk group</span>
              )}
              {row.notice > 0 && (
                <span className="inline-flex items-center gap-1 text-warning"><UserMinus className="h-3 w-3 shrink-0" /> {row.notice} on notice</span>
              )}
              {costs && (() => {
                const cs = Array.from(row.cells.values()).map((r) => costs.get(r.plan_id)).filter(Boolean) as BudgetLine[];
                const known = cs.filter((c) => c.full_cost != null);
                const total = known.reduce((a, c) => a + (c.full_cost || 0), 0);
                return cs.length ? (
                  <span className="font-mono text-foreground" title="Fully staffed, monthly">
                    {formatInr(total)}/mo{known.length < cs.length ? " + in dept. total" : ""}
                  </span>
                ) : null;
              })()}
              {row.trainees > 0 && (
                <span className="inline-flex items-center gap-1 text-primary"><GraduationCap className="h-3 w-3 shrink-0" /> {row.trainees} training</span>
              )}
            </div>
          </td>
          {columns.map((c) => {
            const r = row.cells.get(c.id);
            if (!r) {
              const coveredByAny = c.id !== "any" && row.cells.has("any");
              return (
                <td key={c.id} className="px-2 py-2 text-center align-middle">
                  {coveredByAny ? (
                    <span className="text-[10px] text-muted-foreground">Any-shift line</span>
                  ) : canManage ? (
                    <button type="button" onClick={() => onPlanCell(row, c.id)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                      <Plus className="h-3 w-3" /> Plan
                    </button>
                  ) : (
                    <span className="text-muted-foreground/40">—</span>
                  )}
                </td>
              );
            }
            const tone = gapTone(r.staffingGap);
            return (
              <td key={c.id} className="px-1.5 py-1.5 text-center align-middle">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" onClick={() => onOpenLine(r, row.roleLabel)}
                      className={cn("w-full rounded-md border border-transparent px-1.5 py-1.5 transition-colors hover:border-border hover:bg-muted/50")}
                      aria-label={`${row.roleLabel} ${c.name}: ${r.current_hc} on roll of ${r.required_hc} required, ${gapLabel(r.staffingGap)}`}>
                      <span className="block text-sm font-semibold tabular-nums text-foreground">{r.current_hc} / {r.required_hc}</span>
                      <span className="mt-0.5 flex flex-wrap items-center justify-center gap-1">
                        <Badge variant="outline" className={cn("px-1.5 py-0 text-[10px]", GAP_CHIP_CLASS[tone])}>{gapLabel(r.staffingGap)}</Badge>
                        {r.follow_desks && <span className="text-[10px] text-muted-foreground">= desks</span>}
                        {costs?.get(r.plan_id) && (
                          <span className="block w-full font-mono text-[10px] text-muted-foreground">
                            {costs.get(r.plan_id)!.full_cost != null ? `${formatInr(costs.get(r.plan_id)!.full_cost)}/mo` : "in dept. total"}
                          </span>
                        )}
                        {r.auto_paused_at && <PauseCircle className="h-3 w-3 text-warning" aria-label="Automatic hiring paused" />}
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top"><CellTip r={r} /></TooltipContent>
                </Tooltip>
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

export { seatRoleIds };
