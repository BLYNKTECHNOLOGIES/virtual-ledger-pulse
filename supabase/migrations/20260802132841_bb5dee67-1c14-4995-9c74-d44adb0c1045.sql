CREATE OR REPLACE FUNCTION public.hr_attendance_month_summary(p_employee_ids uuid[], p_period_month date)
RETURNS TABLE(
  employee_id uuid,
  working_days numeric,
  present_days numeric,
  half_days numeric,
  absent_days numeric,
  paid_leave_days numeric,
  unpaid_leave_days numeric,
  held_harmless_days numeric,
  unverified_days numeric,
  lop_days numeric,
  late_minutes numeric,
  early_minutes numeric,
  ot_hours numeric,
  evidence_days numeric,
  legacy_present_days numeric,
  no_biometric_signal boolean,
  formula text,
  config_errors text[]
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_month_start date := date_trunc('month', p_period_month)::date;
  v_month_end   date := (date_trunc('month', p_period_month) + interval '1 month - 1 day')::date;
BEGIN
  RETURN QUERY
  WITH lop AS (
    SELECT * FROM public.hr_lop_days(p_employee_ids, v_month_start)
  ),
  ev AS (
    SELECT p.employee_id AS emp_id,
           (p.punch_time AT TIME ZONE 'Asia/Kolkata')::date AS dt
    FROM public.hr_attendance_punches p
    WHERE p.employee_id = ANY(p_employee_ids)
      AND (p.punch_time AT TIME ZONE 'Asia/Kolkata')::date BETWEEN v_month_start AND v_month_end
    GROUP BY 1,2
    UNION
    SELECT s.employee_id, s.attendance_date
    FROM public.hr_attendance_sessions s
    WHERE s.employee_id = ANY(p_employee_ids)
      AND s.attendance_date BETWEEN v_month_start AND v_month_end
    GROUP BY 1,2
  ),
  daily AS (
    SELECT d.employee_id AS emp_id,
           COALESCE(SUM(d.late_by_minutes), 0)::numeric AS late_min,
           COALESCE(SUM(d.early_by_minutes), 0)::numeric AS early_min,
           COALESCE(SUM(GREATEST(COALESCE(d.net_work_minutes, 0) - 480, 0)), 0)::numeric / 60.0 AS ot_h,
           COUNT(*)::numeric AS ev_days
    FROM public.hr_attendance_daily d
    JOIN ev ON ev.emp_id = d.employee_id AND ev.dt = d.attendance_date
    WHERE d.employee_id = ANY(p_employee_ids)
      AND d.attendance_date BETWEEN v_month_start AND v_month_end
    GROUP BY d.employee_id
  ),
  ev_count AS (
    SELECT emp_id, COUNT(*)::numeric AS ev_days FROM ev GROUP BY emp_id
  ),
  legacy AS (
    SELECT a.employee_id AS emp_id,
           COUNT(*) FILTER (WHERE LOWER(COALESCE(a.attendance_status,'')) IN ('present','late'))::numeric AS legacy_present
    FROM public.hr_attendance a
    WHERE a.employee_id = ANY(p_employee_ids)
      AND a.attendance_date BETWEEN v_month_start AND v_month_end
    GROUP BY a.employee_id
  )
  SELECT
    l.employee_id,
    l.working_days,
    l.present_days,
    l.half_days,
    l.absent_days,
    l.paid_leave_days,
    l.unpaid_leave_days,
    l.incomplete_held_days,
    GREATEST(0, COALESCE(ec.ev_days,0) - l.present_days) * 0 +
      GREATEST(0, l.working_days - l.present_days - l.paid_leave_days - l.unpaid_leave_days
                 - l.incomplete_held_days - l.absent_days) AS unverified_days,
    l.lop_days,
    COALESCE(dd.late_min, 0),
    COALESCE(dd.early_min, 0),
    ROUND(COALESCE(dd.ot_h, 0), 2),
    COALESCE(ec.ev_days, 0),
    COALESCE(lg.legacy_present, 0),
    COALESCE(ec.ev_days, 0) = 0,
    l.formula,
    l.config_errors
  FROM lop l
  LEFT JOIN daily dd ON dd.emp_id = l.employee_id
  LEFT JOIN ev_count ec ON ec.emp_id = l.employee_id
  LEFT JOIN legacy lg ON lg.emp_id = l.employee_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.hr_attendance_month_summary(uuid[], date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_attendance_month_summary(uuid[], date) TO service_role;