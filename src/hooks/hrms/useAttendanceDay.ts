/**
 * V1 — Single attendance truth
 *
 * The ONLY sanctioned reader of per-day attendance state. Consumed by:
 *   • ESS calendar (MyAttendanceCalendar)
 *   • HR overview (AttendanceOverviewPage)
 *   • HR day detail (AttendanceDayDetailPage summary block)
 *   • Anywhere else that needs a status / worked / LOP value
 *
 * Every field returned here comes from `public.hr_attendance_day_v`, which
 * derives from the canonical sources (hr_attendance_daily + hr_stale_session_held
 * + the status dictionary). No surface may re-derive status/LOP locally.
 *
 * A build-time guard (scripts/check-attendance-single-source.sh) fails CI if
 * anything outside this file queries `hr_attendance_daily` or `hr_lop_days`
 * directly.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AttendanceDayStatus =
  | "present"
  | "half_day"
  | "absent"
  | "on_leave"
  | "week_off"
  | "holiday"
  | "incomplete"
  | "in_progress"
  | "no_punch"
  | "no_data";

export interface AttendanceDay {
  employee_id: string;
  date: string; // yyyy-MM-dd
  status: AttendanceDayStatus;
  first_in: string | null;
  last_out: string | null;
  worked_minutes: number;
  break_minutes: number;
  lunch_minutes: number;
  late_minutes: number;
  early_minutes: number;
  is_late: boolean;
  total_hours: number;
  session_count: number;
  suppressed_count: number;
  engine_version: string | null;
  lop_contribution: number;
  watchdog_held: boolean;
}

/**
 * Fetch a date range of attendance days for one or more employees.
 * Server enforces: employees see only themselves; HR admins see all.
 */
export function useAttendanceDayRange(
  employeeIds: string[],
  from: string,
  to: string,
  opts?: { enabled?: boolean; refetchInterval?: number },
) {
  const enabled = opts?.enabled ?? (employeeIds.length > 0 && !!from && !!to);
  const key = ["hr_attendance_day_v1", from, to, [...employeeIds].sort().join(",")];

  return useQuery<AttendanceDay[]>({
    queryKey: key,
    enabled,
    refetchInterval: opts?.refetchInterval,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("hr_attendance_day_range", {
        p_employee_ids: employeeIds,
        p_from: from,
        p_to: to,
      });
      if (error) throw error;
      return (data as AttendanceDay[]) || [];
    },
  });
}

/** Fetch a single employee/day. */
export function useAttendanceDay(employeeId: string, date: string) {
  const q = useAttendanceDayRange([employeeId], date, date, {
    enabled: !!employeeId && !!date,
  });
  return {
    ...q,
    data: q.data?.[0] ?? null,
  };
}

/** Human-friendly LOP label for a day (drives UI copy). */
export function lopLabel(day: Pick<AttendanceDay, "lop_contribution" | "watchdog_held">): string {
  if (day.watchdog_held) return "Held — Watchdog";
  if (day.lop_contribution === 0) return "No LOP";
  if (day.lop_contribution === 0.5) return "½ day LOP";
  return `${day.lop_contribution} LOP`;
}
