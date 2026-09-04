CREATE OR REPLACE FUNCTION public.hr_attendance_day_range(p_employee_ids uuid[], p_from date, p_to date)
 RETURNS SETOF public.hr_attendance_day_v
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH requested_employees AS (
    SELECT DISTINCT unnest(p_employee_ids) AS employee_id
  ),
  requested_days AS (
    SELECT generate_series(p_from, p_to, interval '1 day')::date AS date
    WHERE p_from IS NOT NULL
      AND p_to IS NOT NULL
      AND p_from <= p_to
      AND (p_to - p_from) <= 366
  )
  SELECT
    e.employee_id,
    d.date,
    COALESCE(v.status, CASE WHEN public.hr_is_holiday(d.date) THEN 'holiday' ELSE 'no_data' END)::text AS status,
    v.first_in,
    v.last_out,
    COALESCE(v.worked_minutes, 0)::integer AS worked_minutes,
    COALESCE(v.break_minutes, 0)::integer AS break_minutes,
    COALESCE(v.lunch_minutes, 0)::integer AS lunch_minutes,
    COALESCE(v.late_minutes, 0)::integer AS late_minutes,
    COALESCE(v.early_minutes, 0)::integer AS early_minutes,
    COALESCE(v.is_late, false)::boolean AS is_late,
    COALESCE(v.total_hours, 0)::numeric AS total_hours,
    COALESCE(v.session_count, 0)::integer AS session_count,
    COALESCE(v.suppressed_count, 0)::integer AS suppressed_count,
    v.engine_version,
    COALESCE(v.lop_contribution, 0)::numeric AS lop_contribution,
    COALESCE(v.watchdog_held, false)::boolean AS watchdog_held,
    COALESCE(v.evidence_backed, false)::boolean AS evidence_backed
  FROM requested_employees e
  CROSS JOIN requested_days d
  LEFT JOIN public.hr_attendance_day_v v
    ON v.employee_id = e.employee_id
   AND v.date = d.date
  WHERE (
    public.hr_is_hr_admin()
    OR e.employee_id = public.hr_ess_current_employee_id()
  );
$function$;

GRANT EXECUTE ON FUNCTION public.hr_attendance_day_range(uuid[], date, date) TO authenticated, service_role;