DROP FUNCTION IF EXISTS public.hr_attendance_day_range(uuid[], date, date);

CREATE OR REPLACE FUNCTION public.hr_attendance_day_range(p_employee_ids uuid[], p_from date, p_to date)
RETURNS TABLE(
  employee_id uuid,
  date date,
  status text,
  first_in timestamptz,
  last_out timestamptz,
  worked_minutes integer,
  break_minutes integer,
  lunch_minutes integer,
  late_minutes integer,
  early_minutes integer,
  is_late boolean,
  total_hours numeric,
  session_count integer,
  suppressed_count integer,
  engine_version text,
  lop_contribution numeric,
  watchdog_held boolean,
  evidence_backed boolean,
  is_holiday boolean,
  is_week_off boolean,
  is_working_day boolean,
  on_approved_leave boolean,
  leave_is_paid boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH default_pattern AS (
    SELECT COALESCE(
      (SELECT p.weekly_offs FROM public.hr_weekly_off_patterns p
        WHERE p.is_active = true AND p.weekly_offs IS NOT NULL AND array_length(p.weekly_offs,1) > 0
        ORDER BY p.created_at NULLS LAST LIMIT 1),
      ARRAY[0]) AS off_days
  ),
  requested_employees AS (
    SELECT DISTINCT unnest(p_employee_ids) AS employee_id
  ),
  emp_pat AS (
    SELECT e.employee_id,
      COALESCE(
        (SELECT p.weekly_offs FROM public.hr_employee_weekly_off eo
           JOIN public.hr_weekly_off_patterns p ON p.id = eo.pattern_id
          WHERE eo.employee_id = e.employee_id AND eo.is_current = true AND eo.effective_from <= p_to
          ORDER BY eo.effective_from DESC LIMIT 1),
        (SELECT off_days FROM default_pattern)) AS off_days
    FROM requested_employees e
  ),
  requested_days AS (
    SELECT generate_series(p_from, p_to, interval '1 day')::date AS date
    WHERE p_from IS NOT NULL AND p_to IS NOT NULL AND p_from <= p_to AND (p_to - p_from) <= 366
  ),
  leaves AS (
    SELECT lr.employee_id, gs::date AS d, COALESCE(lt.is_paid, false) AS is_paid
    FROM public.hr_leave_requests lr
    LEFT JOIN public.hr_leave_types lt ON lt.id = lr.leave_type_id
    CROSS JOIN LATERAL generate_series(GREATEST(lr.start_date, p_from)::timestamp,
                                       LEAST(lr.end_date, p_to)::timestamp, interval '1 day') gs
    WHERE lr.employee_id = ANY(p_employee_ids)
      AND LOWER(lr.status) = 'approved'
      AND lr.start_date <= p_to AND lr.end_date >= p_from
  )
  SELECT
    e.employee_id,
    d.date,
    COALESCE(v.status, CASE WHEN public.hr_is_holiday(d.date) THEN 'holiday' ELSE 'no_data' END)::text AS status,
    v.first_in,
    v.last_out,
    COALESCE(v.worked_minutes, 0)::integer,
    COALESCE(v.break_minutes, 0)::integer,
    COALESCE(v.lunch_minutes, 0)::integer,
    COALESCE(v.late_minutes, 0)::integer,
    COALESCE(v.early_minutes, 0)::integer,
    COALESCE(v.is_late, false)::boolean,
    COALESCE(v.total_hours, 0)::numeric,
    COALESCE(v.session_count, 0)::integer,
    COALESCE(v.suppressed_count, 0)::integer,
    v.engine_version,
    COALESCE(v.lop_contribution, 0)::numeric,
    COALESCE(v.watchdog_held, false)::boolean,
    COALESCE(v.evidence_backed, false)::boolean,
    public.hr_is_holiday(d.date) AS is_holiday,
    (EXTRACT(DOW FROM d.date)::int = ANY(ep.off_days)) AS is_week_off,
    (NOT public.hr_is_holiday(d.date) AND NOT (EXTRACT(DOW FROM d.date)::int = ANY(ep.off_days))) AS is_working_day,
    (lv.employee_id IS NOT NULL) AS on_approved_leave,
    COALESCE(bool_or(lv.is_paid), false) AS leave_is_paid
  FROM requested_employees e
  CROSS JOIN requested_days d
  JOIN emp_pat ep ON ep.employee_id = e.employee_id
  LEFT JOIN public.hr_attendance_day_v v
    ON v.employee_id = e.employee_id AND v.date = d.date
  LEFT JOIN leaves lv ON lv.employee_id = e.employee_id AND lv.d = d.date
  WHERE (public.hr_is_hr_admin() OR e.employee_id = public.hr_ess_current_employee_id())
  GROUP BY e.employee_id, d.date, v.status, v.first_in, v.last_out, v.worked_minutes, v.break_minutes,
           v.lunch_minutes, v.late_minutes, v.early_minutes, v.is_late, v.total_hours, v.session_count,
           v.suppressed_count, v.engine_version, v.lop_contribution, v.watchdog_held, v.evidence_backed,
           ep.off_days, lv.employee_id;
$function$;

GRANT EXECUTE ON FUNCTION public.hr_attendance_day_range(uuid[], date, date) TO authenticated, service_role;