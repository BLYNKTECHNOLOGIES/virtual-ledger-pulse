import { AlertTriangle, Armchair, GraduationCap, UserX, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkforceAlerts } from "@/hooks/hrms/useWorkforceAlerts";
import { seatRoleIds } from "@/hooks/hrms/useWorkforceAlerts";
import type { StaffingDerived } from "@/lib/hrms/workforce";

interface Props {
  rows: StaffingDerived[];
  positionTitle: (id: string) => string | undefined;
  canManage: boolean;
  onPlanDesks?: (seat: any) => void;
  onOpenLine?: (planId: string) => void;
}

/** Desks with no line, people with no line, trainees with no after-training shift, over-requested lines. */
export function WorkforceAlertsStrip({ rows, positionTitle, canManage, onPlanDesks, onOpenLine }: Props) {
  const a = useWorkforceAlerts(rows);
  if (a.count === 0) return null;
  const seatName = (s: any) => seatRoleIds(s).map(positionTitle).filter(Boolean).join(" / ") || "Whole department";

  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
      {a.desksWithoutLine.length > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/5 p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Armchair className="h-4 w-4 shrink-0 text-warning" /> {a.desksWithoutLine.length} desk group{a.desksWithoutLine.length > 1 ? "s" : ""} with no staffing line
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
            <UserX className="h-4 w-4 shrink-0 text-warning" /> People with no staffing line
          </p>
          <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
            {a.unplanned.map((u, i) => (
              <li key={i}>{u.position_title ?? "No role"} · {u.department_name ?? "No department"} · {u.shift_name ?? "No shift"} ({u.current_hc})</li>
            ))}
          </ul>
        </div>
      )}
      {a.traineesWithoutShift.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <GraduationCap className="h-4 w-4 shrink-0 text-primary" /> Trainees without an after-training shift
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
      {a.traineesError && (
        <p className="flex items-center gap-1.5 text-xs text-destructive"><AlertTriangle className="h-3.5 w-3.5" /> Couldn't load trainees.</p>
      )}
    </div>
  );
}
