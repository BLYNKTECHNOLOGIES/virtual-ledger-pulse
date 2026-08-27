import type { QueryClient } from "@tanstack/react-query";

/**
 * Every react-query key that renders attendance state derived from
 * `hr_attendance_daily` / `hr_attendance_day_v`. Anything that can change a
 * day's status (regularization approval, leave approval, manual status set,
 * punch edits) MUST invalidate all of them, otherwise calendars keep painting
 * the pre-approval status while the day-detail dialog shows the corrected one.
 */
export const ATTENDANCE_QUERY_KEY_PREFIXES = [
  "hr_attendance_day_v1",
  "hr_attendance_profile_v1",
  "hr_attendance_unified",
  "hr_attendance_unified_v1",
  "hr_attendance_calendar",
  "hr_attendance_month",
  "hr_attendance_month_summary",
  "hr_attendance_daily",
  "hr_attendance_daily_month",
  "hr_attendance_detail",
  "hr_attendance_punches",
  "hr_attendance_maintained",
  "hr_attendance_maintained_prev",
  "hr_attendance",
  "hr_day_detail",
  "hr_dashboard_attendance",
  "rpt_attendance_daily",
  "rpt_attendance_prev",
  "attendance_period_locks",
] as const;

/** Invalidate every attendance-derived cache across HRMS + ESS surfaces. */
export function invalidateAttendanceCaches(qc: QueryClient) {
  ATTENDANCE_QUERY_KEY_PREFIXES.forEach((key) => {
    qc.invalidateQueries({ queryKey: [key] });
  });
}
