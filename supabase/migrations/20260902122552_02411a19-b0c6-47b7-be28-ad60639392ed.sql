CREATE OR REPLACE FUNCTION public.hr_attendance_month_summary(p_employee_ids uuid[], p_period_month date)
 RETURNS TABLE(employee_id uuid, working_days numeric, present_days numeric, half_days numeric, absent_days numeric, paid_leave_days numeric, unpaid_leave_days numeric, held_harmless_days numeric, unverified_days numeric, lop_days numeric, late_minutes numeric, early_minutes numeric, ot_hours numeric, evidence_days numeric, legacy_present_days numeric, no_biometric_signal boolean, formula text, config_errors text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_month_start date := date_trunc('month', p_period_month)::date;
  v_month_end   date := (date_trunc('month', p_period_month) + interval '1 month - 1 day')::date;
  v_today       date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_elapsed_end date := LEAST(v_month_end, v_today);
BEGIN
  RETURN QUERY
  WITH canonical AS (
    -- single source of truth: the same engine the drill-down and payroll use
    SELECT * FROM public.hr_lop_days(p_employee_ids, v_month_start)
  ),
  legacy AS (
    SELECT a.employee_id AS emp_id,
      COUNT(*) FILTER (WHERE lower(coalesce(a.attendance_status, '')) IN ('present','late'))::numeric AS present_d,
      COALESCE(SUM(a.late_minutes),0)::numeric AS late_min,
      COALESCE(SUM(a.early_leave_minutes),0)::numeric AS early_min,
      COALESCE(SUM(a.overtime_hours),0)::numeric AS ot_h
    FROM public.hr_attendance a
    WHERE a.employee_id = ANY(p_employee_ids)
      AND a.attendance_date BETWEEN v_month_start AND v_elapsed_end
    GROUP BY a.employee_id
  ),
  evidence AS (
    SELECT x.emp_id, COUNT(*)::numeric AS evidence_d
    FROM (
      SELECT p.employee_id AS emp_id, (p.punch_time AT TIME ZONE 'Asia/Kolkata')::date AS dt
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
    ) x GROUP BY x.emp_id
  )
  SELECT
    c.employee_id,
    c.working_days,
    c.present_days,
    c.half_days,
    c.absent_days,
    c.paid_leave_days,
    c.unpaid_leave_days,
    c.incomplete_held_days,
    GREATEST(0, c.working_days - c.present_days - c.paid_leave_days - c.unpaid_leave_days
                - c.absent_days - c.incomplete_held_days)::numeric AS unverified_days,
    c.lop_days,
    COALESCE(l.late_min, 0)::numeric,
    COALESCE(l.early_min, 0)::numeric,
    ROUND(COALESCE(l.ot_h, 0), 2)::numeric,
    COALESCE(e.evidence_d, 0)::numeric,
    COALESCE(l.present_d, 0)::numeric AS legacy_present_days,
    (COALESCE(e.evidence_d, 0) = 0) AS no_biometric_signal,
    c.formula,
    c.config_errors
  FROM canonical c
  LEFT JOIN legacy l ON l.emp_id = c.employee_id
  LEFT JOIN evidence e ON e.emp_id = c.employee_id;
END;
$function$;