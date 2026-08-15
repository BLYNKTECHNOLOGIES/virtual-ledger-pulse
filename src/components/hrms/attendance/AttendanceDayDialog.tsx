import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/horilla/primitives/ResponsiveDialog";
import { AlertCircle, ArrowUpRight, CheckCircle2, Clock, Compass, Moon, ShieldAlert } from "lucide-react";
import {
  DAY_STATUS_DOT,
  DAY_STATUS_LABEL,
  hoursLabel,
  istDate,
  istTime,
} from "./DayTileTooltip";
import type { AttendanceDayStatus } from "@/hooks/hrms/useAttendanceDay";


type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  employeeName: string;
  badgeId?: string | null;
  date: string; // yyyy-MM-dd
};

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" | "bad" | "good" }) {
  const toneCls = tone === "bad" ? "text-destructive" : tone === "warn" ? "text-warning" : tone === "good" ? "text-success" : "text-foreground";
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold tabular-nums ${toneCls}`}>{value}</p>
    </div>
  );
}

export function AttendanceDayDialog({ open, onOpenChange, employeeId, employeeName, badgeId, date }: Props) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["hr_day_detail", employeeId, date],
    enabled: open && !!employeeId && !!date,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("hr_attendance_day_detail", {
        p_employee_id: employeeId,
        p_date: date,
      });
      if (error) throw error;
      return data as any;
    },
  });

  const daily = data?.daily || null;
  const flags = data?.flags || {};
  const sessions: any[] = data?.sessions || [];
  const kept: any[] = data?.kept_punches || [];
  const suppressed: any[] = data?.suppressed_punches || [];
  const regs: any[] = data?.regularizations || [];
  const stale: any[] = data?.stale_sessions || [];
  const lop = Number(data?.lop_contribution ?? 0);
  const status = (daily?.status || "no_data") as AttendanceDayStatus;
  const manualStatus: string | null = daily?.manual_status ?? null;

  const setStatus = useMutation({
    mutationFn: async (next: "present" | "absent" | "half_day" | null) => {
      const { error } = await (supabase as any).rpc("hr_set_manual_day_status", {
        p_employee_id: employeeId,
        p_date: date,
        p_status: next,
        p_reason: reason.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Attendance status updated");
      setReason("");
      qc.invalidateQueries({ queryKey: ["hr_day_detail", employeeId, date] });
      qc.invalidateQueries({ queryKey: ["hr_attendance_calendar"] });
      qc.invalidateQueries({ queryKey: ["hr_attendance_month"] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not update status"),
  });

  const firstIn = istTime(daily?.first_in);
  const lastOut = istTime(daily?.last_out);
  const outNextDay = !!(daily?.last_out && istDate(daily.last_out) !== date);


  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      contentClassName="max-w-2xl"
      title={
        <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          <Clock className="h-4 w-4 text-primary" />
          {employeeName}
          {badgeId && <span className="text-xs font-normal text-muted-foreground">{badgeId}</span>}
          <span className="text-xs font-normal text-muted-foreground">· {date}</span>
          <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium">
            <span className={`h-1.5 w-1.5 rounded-full ${DAY_STATUS_DOT[status]}`} />
            {DAY_STATUS_LABEL[status]}
          </span>
        </span>
      }
      footer={
        <>
          <Button variant="outline" className="h-9" onClick={() => onOpenChange(false)}>Close</Button>
          <Button asChild className="h-9">
            <Link to={`/hrms/attendance/day/${employeeId}/${date}`}>
              Open full day detail <ArrowUpRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {isLoading && <p className="py-6 text-center text-sm text-muted-foreground">Loading day detail…</p>}
        {error && <p className="py-4 text-sm text-destructive">{(error as Error).message}</p>}

        {!isLoading && !error && (
          <>
            {/* Flags */}
            {(flags.judged_shift || flags.night_span || flags.shift_deviation || lop > 0 || stale.length > 0) && (
              <div className="flex flex-wrap gap-2">
                {flags.judged_shift && (
                  <Badge variant="outline" className="text-[11px]">
                    <Compass className="mr-1 h-3 w-3" />
                    Judged on {flags.judged_shift}
                  </Badge>
                )}
                {flags.night_span && (
                  <Badge variant="outline" className="text-[11px]"><Moon className="mr-1 h-3 w-3" /> night span</Badge>
                )}
                {flags.shift_deviation && (
                  <Badge variant="outline" className="border-warning/40 text-[11px] text-warning">
                    <Compass className="mr-1 h-3 w-3" />
                    worked off-shift{flags.assigned_shift ? ` (assigned ${flags.assigned_shift})` : ""}
                  </Badge>
                )}
                {stale.length > 0 && (
                  <Badge variant="outline" className="border-destructive/40 text-[11px] text-destructive">
                    <ShieldAlert className="mr-1 h-3 w-3" /> watchdog hold
                  </Badge>
                )}
                {lop > 0 && (
                  <Badge variant="outline" className="border-destructive/40 text-[11px] text-destructive">
                    LOP {lop === 0.5 ? "½ day" : lop}
                  </Badge>
                )}
              </div>
            )}

            {/* Manual status override */}
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Set status manually
                </p>
                {manualStatus && (
                  <Badge variant="outline" className="border-primary/40 text-[10px] text-primary">
                    manual override active
                  </Badge>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {([
                  { key: "present", label: "Present" },
                  { key: "half_day", label: "Half day" },
                  { key: "absent", label: "Absent" },
                ] as const).map((o) => (
                  <Button
                    key={o.key}
                    size="sm"
                    variant={manualStatus === o.key ? "default" : "outline"}
                    className="h-8"
                    disabled={setStatus.isPending}
                    onClick={() => setStatus.mutate(o.key)}
                  >
                    {o.label}
                  </Button>
                ))}
                {manualStatus && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8"
                    disabled={setStatus.isPending}
                    onClick={() => setStatus.mutate(null)}
                  >
                    Clear override
                  </Button>
                )}
              </div>
              <Input
                className="mt-2 h-8 text-xs"
                placeholder="Reason (optional, recorded in the audit log)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              {manualStatus && daily?.manual_status_reason && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Existing note: {daily.manual_status_reason}
                </p>
              )}
            </div>


            {/* Summary */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="First in" value={firstIn || "—"} />
              <Stat label="Last out" value={lastOut ? `${lastOut}${outNextDay ? " +1d" : ""}` : "—"} />
              <Stat label="Worked" value={hoursLabel(daily?.net_work_minutes)} />
              <Stat label="Break" value={hoursLabel((daily?.break_minutes || 0) + (daily?.lunch_minutes || 0))} />
              <Stat label="Late by" value={`${daily?.late_by_minutes || 0}m`} tone={(daily?.late_by_minutes || 0) > 0 ? "warn" : undefined} />
              <Stat label="Early out by" value={`${daily?.early_by_minutes || 0}m`} tone={(daily?.early_by_minutes || 0) > 0 ? "warn" : undefined} />
              <Stat label="Sessions" value={String(daily?.session_count ?? sessions.length)} />
              <Stat label="LOP today" value={lop === 0 ? "None" : lop === 0.5 ? "½ day" : String(lop)} tone={lop > 0 ? "bad" : "good"} />
            </div>

            {/* Sessions */}
            <div className="rounded-lg border">
              <div className="border-b bg-muted/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Sessions
              </div>
              {sessions.length === 0 ? (
                <p className="px-3 py-3 text-xs text-muted-foreground">No sessions built for this day.</p>
              ) : (
                <ul className="divide-y">
                  {sessions.map((s: any) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="font-mono text-xs tabular-nums text-foreground">{s.label}</span>
                      {s.is_open && <Badge variant="outline" className="text-[10px] text-warning">open</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Punches */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg border">
                <div className="flex items-center gap-1.5 border-b bg-muted/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" /> Kept punches ({kept.length})
                </div>
                {kept.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-muted-foreground">No punches in the 05:00 → 05:00 IST window.</p>
                ) : (
                  <ul className="divide-y">
                    {kept.map((p: any) => (
                      <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs">
                        <span className="font-mono tabular-nums text-foreground">{istTime(p.punch_time)}</span>
                        <span className="truncate text-muted-foreground">{p.device_name || p.device_serial || "—"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-lg border">
                <div className="flex items-center gap-1.5 border-b bg-muted/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <AlertCircle className="h-3.5 w-3.5 text-warning" /> Suppressed ({suppressed.length})
                </div>
                {suppressed.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-muted-foreground">Nothing suppressed.</p>
                ) : (
                  <ul className="divide-y">
                    {suppressed.map((p: any) => (
                      <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs">
                        <span className="font-mono tabular-nums text-foreground">{istTime(p.punch_time)}</span>
                        <span className="truncate text-muted-foreground">{p.suppressed_reason || "suppressed"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Regularizations */}
            {regs.length > 0 && (
              <div className="rounded-lg border">
                <div className="border-b bg-muted/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Regularization history
                </div>
                <ul className="divide-y">
                  {regs.map((r: any) => (
                    <li key={r.id} className="px-3 py-2 text-xs">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] capitalize">{String(r.status).replace(/_/g, " ")}</Badge>
                        <span className="font-mono tabular-nums text-muted-foreground">
                          {istTime(r.requested_check_in) || "—"} → {istTime(r.requested_check_out) || "—"}
                        </span>
                      </div>
                      {(r.reason || r.approver_notes) && (
                        <p className="mt-1 text-[11px] text-muted-foreground">{r.reason || r.approver_notes}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </ResponsiveDialog>
  );
}
