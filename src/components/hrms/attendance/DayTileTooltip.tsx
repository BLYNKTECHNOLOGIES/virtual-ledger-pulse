import type { AttendanceDay, AttendanceDayStatus } from "@/hooks/hrms/useAttendanceDay";

export const DAY_STATUS_LABEL: Record<AttendanceDayStatus, string> = {
  present: "Present",
  half_day: "Half day",
  absent: "Absent",
  on_leave: "On leave",
  week_off: "Week off",
  holiday: "Holiday",
  incomplete: "Incomplete",
  in_progress: "In progress",
  no_punch: "No punch",
  no_data: "No data",
};

/** Tailwind tile styles per engine status — semantic tokens only. */
export const DAY_STATUS_TILE: Record<AttendanceDayStatus, string> = {
  present: "bg-success/15 text-success ring-1 ring-inset ring-success/30",
  half_day: "bg-info/15 text-info ring-1 ring-inset ring-info/30",
  absent: "bg-destructive/15 text-destructive ring-1 ring-inset ring-destructive/30",
  on_leave: "bg-primary/15 text-primary ring-1 ring-inset ring-primary/30",
  week_off: "bg-muted/60 text-muted-foreground/70",
  holiday: "bg-primary/10 text-primary ring-1 ring-inset ring-primary/20",
  incomplete: "bg-warning/20 text-warning ring-1 ring-inset ring-warning/40",
  in_progress: "bg-warning/10 text-warning ring-1 ring-inset ring-warning/25",
  no_punch: "bg-muted/25 text-muted-foreground",
  no_data: "bg-muted/20 text-muted-foreground",
};

export const DAY_STATUS_DOT: Record<AttendanceDayStatus, string> = {
  present: "bg-success",
  half_day: "bg-info",
  absent: "bg-destructive",
  on_leave: "bg-primary",
  week_off: "bg-muted-foreground/40",
  holiday: "bg-primary/60",
  incomplete: "bg-warning",
  in_progress: "bg-warning/70",
  no_punch: "bg-muted-foreground/30",
  no_data: "bg-muted-foreground/20",
};

/** IST wall-clock HH:mm from a timestamptz string. */
export function istTime(ts: string | null | undefined): string | null {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** IST calendar date (yyyy-MM-dd) from a timestamptz string. */
export function istDate(ts: string | null | undefined): string | null {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
}

export function hoursLabel(minutes: number | null | undefined): string {
  const m = Math.max(0, Math.round(Number(minutes ?? 0)));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/**
 * Compact hover summary for a calendar day tile. Built entirely from the
 * already-loaded AttendanceDay row — no fetch on hover.
 */
export function DayTileTooltip({
  day,
  dateLabel,
  fallback,
}: {
  day: AttendanceDay | undefined;
  dateLabel: string;
  fallback?: string;
}) {
  const status = (day?.status || "no_data") as AttendanceDayStatus;
  const inT = istTime(day?.first_in);
  const outT = istTime(day?.last_out);
  const outNextDay = !!(day?.last_out && istDate(day.last_out) !== day.date);

  return (
    <div className="space-y-1.5 text-[11px] leading-snug">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${DAY_STATUS_DOT[status]}`} />
        <span className="font-semibold text-foreground">{dateLabel}</span>
        <span className="text-muted-foreground">{DAY_STATUS_LABEL[status]}</span>
      </div>

      {inT || outT ? (
        <div className="tabular-nums text-foreground">
          {inT || "--:--"} <span className="text-muted-foreground">→</span> {outT || "--:--"}
          {outNextDay && <span className="ml-1 text-muted-foreground">+1d</span>}
        </div>
      ) : (
        <div className="text-muted-foreground">{fallback || "No punch recorded"}</div>
      )}

      {day && (day.worked_minutes > 0 || day.session_count > 0) && (
        <div className="tabular-nums text-muted-foreground">
          Worked {hoursLabel(day.worked_minutes)}
          {day.session_count > 0 && ` · ${day.session_count} session${day.session_count === 1 ? "" : "s"}`}
        </div>
      )}

      {day && (day.late_minutes > 0 || day.early_minutes > 0) && (
        <div className="tabular-nums text-warning">
          {day.late_minutes > 0 && `Late ${day.late_minutes}m`}
          {day.late_minutes > 0 && day.early_minutes > 0 && " · "}
          {day.early_minutes > 0 && `Early out ${day.early_minutes}m`}
        </div>
      )}

      {day?.watchdog_held && <div className="text-destructive">Held — watchdog</div>}
      {day && day.suppressed_count > 0 && (
        <div className="text-muted-foreground">{day.suppressed_count} punch(es) suppressed</div>
      )}

      <div className="pt-0.5 text-[10px] text-muted-foreground/70">Click for full detail</div>
    </div>
  );
}
