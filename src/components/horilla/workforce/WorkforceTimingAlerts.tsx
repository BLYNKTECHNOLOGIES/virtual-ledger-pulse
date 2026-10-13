import { useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { usePermissions } from "@/hooks/usePermissions";
import { useWorkforceLookups, useWorkforceTrainees, type TraineeRow } from "@/hooks/hrms/useWorkforcePlanning";
import { useMoveAfterTraining, useOverdueJoiners } from "@/hooks/hrms/useWorkforceTiming";
import { formatIstDate, istNextDay, istToday, trainingEnded } from "@/lib/hrms/workforce";

/** "Training finished — move X" and "overdue joiners" alerts for HR (Overview, Staffing Plan, HRMS home). */
export function WorkforceTimingAlerts({ compact = false }: { compact?: boolean }) {
  const { hasPermission } = usePermissions();
  const allowed = hasPermission("hrms_view") || hasPermission("hrms_manage");
  const canManage = hasPermission("hrms_manage");
  const trainees = useWorkforceTrainees();
  const overdue = useOverdueJoiners(allowed);
  const lookups = useWorkforceLookups();
  const move = useMoveAfterTraining();
  const [target, setTarget] = useState<TraineeRow | null>(null);
  const [shiftId, setShiftId] = useState("");

  if (!allowed) return null;
  const today = istToday();
  const tomorrow = istNextDay(today);
  const ended = (trainees.data || []).filter((t) => trainingEnded(t.training_end_date, today));
  const late = overdue.data || [];
  if (!ended.length && !late.length) return null;
  const workShifts = ((lookups.data?.shifts ?? []) as any[]).filter((s) => !s.is_training_shift);
  const shiftName = (id: string) => workShifts.find((s) => s.id === id)?.name ?? "the chosen shift";

  return (
    <div className="space-y-2">
      {ended.map((t) => (
        <div key={t.employee_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <span className="flex items-center gap-2 text-foreground">
            <GraduationCap className="h-4 w-4 shrink-0 text-warning" />
            Training finished on {formatIstDate(t.training_end_date)} — move {t.full_name || "this trainee"} to {t.post_training_shift_name || "their working shift"}.
          </span>
          {canManage && (
            <Button size="sm" variant="outline" disabled={move.isPending}
              onClick={() => { setTarget(t); setShiftId(t.post_training_shift_id || ""); }}>
              Move from {formatIstDate(tomorrow)}
            </Button>
          )}
        </div>
      ))}
      {late.length > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <p className="flex items-center gap-2 font-medium text-foreground">
            <CalendarClock className="h-4 w-4 shrink-0 text-warning" />
            {late.length} overdue joiner{late.length === 1 ? "" : "s"} — still counted as joining until HR changes the date or cancels
          </p>
          {!compact && (
            <ul className="mt-1.5 space-y-1 text-muted-foreground">
              {late.map((j) => (
                <li key={j.onboarding_id} className="flex flex-wrap items-center gap-x-2">
                  <span className="text-foreground">{j.full_name || "Unnamed"}</span>
                  <span>{[j.position_title, j.department_name].filter(Boolean).join(" · ")} · was due {formatIstDate(j.date_of_joining)} ({j.days_overdue} days ago)</span>
                  <Link className="text-primary hover:underline" to={`/hrms/onboarding-pipeline?id=${j.onboarding_id}`}>Change date or cancel</Link>
                </li>
              ))}
            </ul>
          )}
          {compact && <Link className="text-xs text-primary hover:underline" to="/hrms/workforce-planning">Review on Workforce Overview</Link>}
        </div>
      )}

      <AlertDialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move {target?.full_name || "this trainee"} off the training shift?</AlertDialogTitle>
            <AlertDialogDescription>
              From {formatIstDate(tomorrow)} they work {shiftId ? shiftName(shiftId) : "the shift you pick"} and count on that shift's staffing line. This is the same shift change as on the Employees shift screen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {!target?.post_training_shift_id && (
            <div className="space-y-1">
              <Label>Shift after training</Label>
              <Select value={shiftId || undefined} onValueChange={setShiftId}>
                <SelectTrigger className="text-foreground"><SelectValue placeholder="Choose a shift" /></SelectTrigger>
                <SelectContent>{workShifts.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction disabled={!shiftId}
              onClick={() => { if (target && shiftId) move.mutate({ employeeId: target.employee_id, shiftId, from: tomorrow }); setTarget(null); }}>
              Move from {formatIstDate(tomorrow)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
