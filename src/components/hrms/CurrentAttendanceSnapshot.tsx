import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAttendanceDay, type AttendanceDayStatus } from "@/hooks/hrms/useAttendanceDay";
import { DAY_STATUS_DOT, DAY_STATUS_LABEL, istTime } from "@/components/hrms/attendance/DayTileTooltip";
import { CheckCircle2, AlertCircle } from "lucide-react";

const fmt = (ts: string | null) =>
  ts ? new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—";

/**
 * Read-only "what is currently marked" snapshot for one employee/day.
 * Uses the single sanctioned attendance reader so it always matches the
 * calendar and the day-detail dialog.
 */
export function CurrentAttendanceSnapshot({
  employeeId,
  date,
}: {
  employeeId: string;
  date: string;
}) {
  const { data, isLoading } = useAttendanceDay(employeeId, date);

  const { data: detail } = useQuery({
    queryKey: ["hr_day_detail", employeeId, date],
    enabled: !!employeeId && !!date,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("hr_attendance_day_detail", {
        p_employee_id: employeeId,
        p_date: date,
      });
      if (error) throw error;
      return data as any;
    },
  });

  const kept: any[] = detail?.kept_punches || [];
  const suppressed: any[] = detail?.suppressed_punches || [];

  if (!employeeId || !date) return null;

  const status: AttendanceDayStatus = (data?.status as AttendanceDayStatus) || "no_data";


  return (
    <div className="rounded-md border border-border bg-muted/30 p-2.5 text-xs space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="uppercase tracking-wide text-muted-foreground">Currently marked</span>
        {!isLoading && (
          <span className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${DAY_STATUS_DOT[status] || "bg-muted"}`} />
            <span className="font-medium text-foreground">
              {DAY_STATUS_LABEL[status] || "No data"}
            </span>
          </span>
        )}
      </div>
      {isLoading ? (
        <p className="text-muted-foreground">Loading current attendance…</p>
      ) : data ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-foreground">
          <span className="text-muted-foreground">Check-in</span>
          <span className="tabular-nums">{fmt(data.first_in)}</span>
          <span className="text-muted-foreground">Check-out</span>
          <span className="tabular-nums">{fmt(data.last_out)}</span>
          <span className="text-muted-foreground">Worked</span>
          <span className="tabular-nums">
            {Math.floor((Number(data.worked_minutes) || 0) / 60)}h {(Number(data.worked_minutes) || 0) % 60}m
          </span>
          {(data.late_minutes > 0 || data.early_minutes > 0) && (
            <>
              <span className="text-muted-foreground">Late / Early</span>
              <span className="tabular-nums">
                {data.late_minutes || 0}m late · {data.early_minutes || 0}m early
              </span>
            </>
          )}
        </div>
      ) : (
        <p className="text-muted-foreground">No attendance recorded for this date.</p>
      )}
    </div>
  );
}
