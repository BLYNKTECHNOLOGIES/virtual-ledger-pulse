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
  v_month_end date := (date_trunc('month', p_period_month) + interval '1 month - 1 day')::date;
BEGIN
  RETURN QUERY
  WITH safeguards AS (
    SELECT * FROM public.hr_lop_days(p_employee_ids, v_month_start)
  ),
  maintained AS (
    SELECT
      a.employee_id AS emp_id,
      COUNT(*) FILTER (WHERE lower(coalesce(a.attendance_status, '')) IN ('present', 'late'))::numeric AS present_d,
      COUNT(*) FILTER (WHERE lower(coalesce(a.attendance_status, '')) = 'half_day')::numeric AS half_d,
      COUNT(*) FILTER (WHERE lower(coalesce(a.attendance_status, '')) = 'absent')::numeric AS absent_d,
      COALESCE(SUM(a.late_minutes), 0)::numeric AS late_min,
      COALESCE(SUM(a.early_leave_minutes), 0)::numeric AS early_min,
      COALESCE(SUM(a.overtime_hours), 0)::numeric AS ot_h,
      COUNT(*)::numeric AS maintained_days
    FROM public.hr_attendance a
    WHERE a.employee_id = ANY(p_employee_ids)
      AND a.attendance_date BETWEEN v_month_start AND v_month_end
    GROUP BY a.employee_id
  ),
  evidence AS (
    SELECT x.emp_id, COUNT(*)::numeric AS evidence_d
    FROM (
      SELECT p.employee_id AS emp_id, (p.punch_time AT TIME ZONE 'Asia/Kolkata')::date AS dt
      FROM public.hr_attendance_punches p
      WHERE p.employee_id = ANY(p_employee_ids)
        AND (p.punch_time AT TIME ZONE 'Asia/Kolkata')::date BETWEEN v_month_start AND v_month_end
      GROUP BY 1, 2
      UNION
      SELECT s.employee_id, s.attendance_date
      FROM public.hr_attendance_sessions s
      WHERE s.employee_id = ANY(p_employee_ids)
        AND s.attendance_date BETWEEN v_month_start AND v_month_end
      GROUP BY 1, 2
    ) x
    GROUP BY x.emp_id
  ),
  resolved AS (
    SELECT
      s.*,
      COALESCE(m.present_d, 0)::numeric AS maintained_present,
      COALESCE(m.half_d, 0)::numeric AS maintained_half,
      COALESCE(m.absent_d, 0)::numeric AS maintained_absent,
      COALESCE(m.late_min, 0)::numeric AS maintained_late,
      COALESCE(m.early_min, 0)::numeric AS maintained_early,
      COALESCE(m.ot_h, 0)::numeric AS maintained_ot,
      COALESCE(m.maintained_days, 0)::numeric AS maintained_days,
      COALESCE(e.evidence_d, 0)::numeric AS evidence_d,
      public.hr_is_contractor(s.employee_id) AS is_contractor
    FROM safeguards s
    LEFT JOIN maintained m ON m.emp_id = s.employee_id
    LEFT JOIN evidence e ON e.emp_id = s.employee_id
  )
  SELECT
    r.employee_id,
    r.working_days,
    r.maintained_present,
    r.maintained_half,
    r.maintained_absent,
    r.paid_leave_days,
    r.unpaid_leave_days,
    r.incomplete_held_days,
    GREATEST(0, r.working_days - r.maintained_present - (r.maintained_half * 0.5)
      - r.paid_leave_days - r.unpaid_leave_days - r.incomplete_held_days - r.maintained_absent),
    CASE
      WHEN r.is_contractor THEN 0::numeric
      WHEN r.maintained_days = 0 THEN 0::numeric
      ELSE GREATEST(0, LEAST(r.working_days,
        r.working_days - r.maintained_present - (r.maintained_half * 0.5)
        - r.paid_leave_days - r.incomplete_held_days))::numeric
    END,
    r.maintained_late,
    r.maintained_early,
    ROUND(r.maintained_ot, 2),
    r.evidence_d,
    r.maintained_present,
    r.maintained_days = 0,
    CASE
      WHEN r.is_contractor THEN 'LOP = 0 (contract employee — attendance summary shown for reference)'
      WHEN r.maintained_days = 0 THEN 'LOP suppressed — no maintained Attendance Summary rows for this month'
      ELSE format('LOP = working days %s − (Attendance Summary present %s + half-day credit %s + paid leave %s + held harmless %s) = %s',
        r.working_days, r.maintained_present, r.maintained_half * 0.5, r.paid_leave_days,
        r.incomplete_held_days,
        GREATEST(0, LEAST(r.working_days,
          r.working_days - r.maintained_present - (r.maintained_half * 0.5)
          - r.paid_leave_days - r.incomplete_held_days)))
    END,
    CASE
      WHEN r.maintained_days = 0 AND NOT r.is_contractor
        THEN r.config_errors || ARRAY['No maintained Attendance Summary rows for this month — LOP suppressed for review.']
      ELSE r.config_errors
    END
  FROM resolved r;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.hr_attendance_month_summary(uuid[], date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_attendance_month_summary(uuid[], date) TO service_role;

COMMENT ON FUNCTION public.hr_attendance_month_summary(uuid[], date) IS
  'Canonical monthly attendance and payroll LOP source. Present/absent/half-day values come from maintained hr_attendance summary rows; hr_lop_days contributes calendar, leave, held-harmless, and contractor safeguards.';