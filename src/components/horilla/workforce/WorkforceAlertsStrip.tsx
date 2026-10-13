import { Link } from "react-router-dom";
import { AlertTriangle, Armchair, GraduationCap, Link2Off, PauseCircle, UserX, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkforceAlerts, type AlertScope } from "@/hooks/hrms/useWorkforceAlerts";
import { seatRoleIds } from "@/hooks/hrms/useWorkforceAlerts";
import { pauseText, type StaffingDerived } from "@/lib/hrms/workforce";

interface Props {
  rows: StaffingDerived[];
  positionTitle: (id: string) => string | undefined;
  canManage: boolean;
  onPlanDesks?: (seat: any) => void;
  onOpenLine?: (planId: string) => void;
  /** Department / role filter for alerts that sit on no line; rows carry the page's line filters. */
  scope?: AlertScope;
  /** A shift filter is set: alerts that sit on no line can't follow it and say so. */
  shiftFiltered?: boolean;
}

/** Desks with no line, people with no line, trainees with no after-training shift, over-requested lines. */
export function WorkforceAlertsStrip({ rows, positionTitle, canManage, onPlanDesks, onOpenLine, scope, shiftFiltered }: Props) {
  const a = useWorkforceAlerts(rows, scope);
  const cw = shiftFiltered ? <span className="ml-1 text-[11px] font-normal text-muted-foreground">(all shifts)</span> : null;
  if (a.count === 0) return null;
  const seatName = (s: any) => seatRoleIds(s).map(positionTitle).filter(Boolean).join(" / ") || "Whole department";

  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
      {a.desksWithoutLine.length > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/5 p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Armchair className="h-4 w-4 shrink-0 text-warning" /> {a.desksWithoutLine.length} desk group{a.desksWithoutLine.length > 1 ? "s" : ""} with no staffing line{cw}
          </p>
          <ul className="mt-1.5 space-y-1">
            {a.desksWithoutLine.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="min-w-0 truncate">{seatName(s)} · {s.departments?.name ?? "—"} · {s.physical_seats} desks</span>
                {canManage && onPlanDesks && (
                  <Button size="sm" variant="outline" className="h-7 shrink-0" onClick={() => onPlanDesks(s)}>Plan these desks</Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {a.unplanned.length > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/5 p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <UserX className="h-4 w-4 shrink-0 text-warning" /> People with no staffing line{cw}
          </p>
          <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
            {a.unplanned.map((u, i) => (
              <li key={i}>{u.position_title ?? "No role"} · {u.department_name ?? "No department"} · {u.shift_name ?? "No shift"} ({u.current_hc})</li>
            ))}
          </ul>
        </div>
      )}
      {a.seatFull.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Armchair className="h-4 w-4 shrink-0 text-primary" /> Seat capacity reached
          </p>
          <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
            {a.seatFull.map((r) => (
              <li key={r.plan_id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">{r.position_title} · {r.shiftLabel}: {r.current_hc} on roll = {r.operational_capacity} desks — more people need more desks</span>
                {onOpenLine && <Button size="sm" variant="ghost" className="h-7 shrink-0" onClick={() => onOpenLine(r.plan_id)}>Open</Button>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {a.traineesWithoutShift.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <GraduationCap className="h-4 w-4 shrink-0 text-primary" /> Trainees without an after-training shift{cw}
          </p>
          <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
            {a.traineesWithoutShift.map((t) => (
              <li key={t.employee_id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">{t.full_name} · {t.position_title} · {t.line_label ? `covering ${t.line_label}` : "no line"}</span>
                {t.plan_id && onOpenLine && (
                  <Button size="sm" variant="ghost" className="h-7 shrink-0" onClick={() => onOpenLine(t.plan_id!)}>Set shift</Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {a.overRequested.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Users className="h-4 w-4 shrink-0 text-warning" /> Requirements asking for more than needed
          </p>
          <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
            {a.overRequested.map((r) => (
              <li key={r.plan_id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">{r.position_title} · {r.shiftLabel}: {r.over_requested_hc} more than the line needs</span>
                {onOpenLine && <Button size="sm" variant="ghost" className="h-7 shrink-0" onClick={() => onOpenLine(r.plan_id)}>Open</Button>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {a.paused.length > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/5 p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <PauseCircle className="h-4 w-4 shrink-0 text-warning" /> Automatic hiring paused
          </p>
          <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
            {a.paused.map((r) => (
              <li key={r.plan_id} className="flex items-center justify-between gap-2">
                <span className="min-w-0">{r.position_title} · {r.shiftLabel}: {pauseText(r)?.replace("Automatic hiring paused — ", "")}</span>
                {onOpenLine && <Button size="sm" variant="ghost" className="h-7 shrink-0" onClick={() => onOpenLine(r.plan_id)}>Open</Button>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {(a.unlinked.length > 0 || a.onInactiveLine.length > 0) && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Link2Off className="h-4 w-4 shrink-0 text-destructive" /> Requirements that need a staffing line{cw}
          </p>
          <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
            {a.onInactiveLine.map((r: any) => (
              <li key={r.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">{r.requirement_no} · {r.positions?.title}: its line was removed — it counts nowhere until moved</span>
                <Button asChild size="sm" variant="ghost" className="h-7 shrink-0"><Link to={`/hrms/workforce-planning/hiring-requirements?req=${r.id}`}>Move</Link></Button>
              </li>
            ))}
            {a.unlinked.map((r: any) => (
              <li key={r.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">{r.requirement_no} · {r.positions?.title}: not linked to a staffing line</span>
                <Button asChild size="sm" variant="ghost" className="h-7 shrink-0"><Link to={`/hrms/workforce-planning/hiring-requirements?req=${r.id}`}>Link to line</Link></Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {a.traineesError && (
        <p className="flex items-center gap-1.5 text-xs text-destructive"><AlertTriangle className="h-3.5 w-3.5" /> Couldn't load trainees.</p>
      )}
    </div>
  );
}
