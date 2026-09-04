import { useMemo, useState } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isToday } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useComplianceSettings, isWeeklyOff } from "@/hooks/hrms/useComplianceSettings";
import { useMonthHolidays } from "@/hooks/hrms/useMonthHolidays";

import { useAttendanceDayRange, type AttendanceDay, type AttendanceDayStatus } from "@/hooks/hrms/useAttendanceDay";
import { DayTileTooltip, DAY_STATUS_DOT, DAY_STATUS_LABEL, DAY_STATUS_TILE } from "@/components/hrms/attendance/DayTileTooltip";
import { AttendanceDayDialog } from "@/components/hrms/attendance/AttendanceDayDialog";

const LEGEND_STATUSES: AttendanceDayStatus[] = [
  "present", "half_day", "absent", "on_leave", "holiday", "week_off", "incomplete", "in_progress", "no_punch",
];

interface Props {
  employeeId: string;
  employeeName: string;
  badgeId?: string | null;
}

/**
 * Single-employee month calendar — same v4 engine truth, tooltips and day-detail
 * dialog as the HRMS Attendance Calendar page, scoped to one employee.
 */
export function EmployeeAttendanceCalendar({ employeeId, employeeName, badgeId }: Props) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [dayDialog, setDayDialog] = useState<string | null>(null);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDay = getDay(monthStart);

  const { data: complianceSettings } = useComplianceSettings();
  const { data: holidays = {} } = useMonthHolidays(format(monthStart, "yyyy-MM-dd"), format(monthEnd, "yyyy-MM-dd"));
  const { data: engineDays = [], isLoading } = useAttendanceDayRange(
    employeeId ? [employeeId] : [],
    format(monthStart, "yyyy-MM-dd"),
    format(monthEnd, "yyyy-MM-dd"),
  );


  const byDate = useMemo(() => {
    const map: Record<string, AttendanceDay> = {};
    (engineDays as AttendanceDay[]).forEach((d) => { map[d.date] = d; });
    return map;
  }, [engineDays]);

  const stats = useMemo(() => {
    const rows = engineDays as AttendanceDay[];
    const base = rows.filter((d) => !["week_off", "holiday", "no_data"].includes(d.status)).length;
    const present = rows.filter((d) => d.status === "present").length;
    const half = rows.filter((d) => d.status === "half_day").length;
    const absent = rows.filter((d) => d.status === "absent").length;
    const late = rows.filter((d) => d.is_late).length;
    const worked = rows.reduce((s, d) => s + (Number(d.worked_minutes) || 0), 0);
    return {
      base, present, half, absent, late,
      rate: base > 0 ? (((present + half * 0.5) / base) * 100).toFixed(1) : "0",
      workedHours: Math.round(worked / 60),
    };
  }, [engineDays]);

  return (
    <TooltipProvider delayDuration={120}>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-base font-semibold text-foreground">Attendance Calendar</h3>
          <div className="flex items-center gap-1 bg-card border border-border rounded-lg px-1">
            <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-semibold text-sm min-w-[130px] text-center">{format(currentMonth, "MMMM yyyy")}</span>
            <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {[
            { label: "Present", value: stats.present },
            { label: "Half day", value: stats.half },
            { label: "Absent", value: stats.absent },
            { label: "Late", value: stats.late },
            { label: "Worked", value: `${stats.workedHours}h` },
            { label: "Rate", value: `${stats.rate}%` },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-2.5 text-center">
                <p className="text-base font-bold text-foreground tabular-nums">{s.value}</p>
                <p className="text-[10px] text-muted-foreground">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex gap-1.5 flex-wrap">
          {LEGEND_STATUSES.map((status) => (
            <div key={status} className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-0.5 text-[10px]">
              <div className={`w-2 h-2 rounded-full ${DAY_STATUS_DOT[status]}`} />
              <span className="text-muted-foreground">{DAY_STATUS_LABEL[status]}</span>
            </div>
          ))}
        </div>

        <div className="border border-border rounded-lg p-3">
          <div className="grid grid-cols-7 gap-1.5">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div key={i} className="text-center text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider py-1">{d}</div>
            ))}
            {Array.from({ length: startDay }).map((_, i) => <div key={`pad-${i}`} className="aspect-square" />)}
            {days.map((day) => {
              const dateStr = format(day, "yyyy-MM-dd");
              const record = byDate[dateStr];
              const weeklyOff = isWeeklyOff(day, complianceSettings);
              const holidayName = holidays[dateStr];
              const status: AttendanceDayStatus =
                record?.status && record.status !== "no_data"
                  ? record.status
                  : holidayName ? "holiday" : weeklyOff ? "week_off" : "no_data";

              const hasDetail = !!record && record.status !== "no_data";

              return (
                <Tooltip key={dateStr} delayDuration={120}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setDayDialog(dateStr)}
                      className={`aspect-square w-full flex items-center justify-center rounded-md text-xs font-medium relative transition-colors
                        outline-none focus-visible:ring-2 focus-visible:ring-ring hover:brightness-110
                        ${DAY_STATUS_TILE[status]}
                        ${isToday(day) ? "ring-2 ring-primary ring-offset-1 ring-offset-background font-bold" : ""}`}
                      aria-label={`${format(day, "MMM d")} — ${DAY_STATUS_LABEL[status]} — open detail`}
                    >
                      {day.getDate()}
                      {hasDetail && (record.late_minutes > 0 || record.early_minutes > 0) && (
                        <span className="absolute top-0.5 right-0.5 w-1 h-1 rounded-full bg-warning" />
                      )}
                      {record?.watchdog_held && (
                        <span className="absolute bottom-0.5 right-0.5 w-1 h-1 rounded-full bg-destructive" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[240px]">
                    <DayTileTooltip
                      day={record}
                      dateLabel={format(day, "EEE, MMM d")}
                      fallback={holidayName ? `Holiday — ${holidayName}` : weeklyOff ? "Weekly off" : "No punch recorded"}
                    />
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
          {isLoading && <p className="text-xs text-muted-foreground mt-2">Loading attendance…</p>}
        </div>

        <AttendanceDayDialog
          open={!!dayDialog}
          onOpenChange={(o) => !o && setDayDialog(null)}
          employeeId={employeeId}
          employeeName={employeeName}
          badgeId={badgeId || ""}
          date={dayDialog || ""}
        />
      </div>
    </TooltipProvider>
  );
}
