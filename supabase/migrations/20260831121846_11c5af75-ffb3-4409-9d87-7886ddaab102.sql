CREATE OR REPLACE FUNCTION public.hr_is_holiday(p_date date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.hr_holidays h
    WHERE h.is_active = true
      AND (
        h.date = p_date
        OR (h.recurring = true
            AND EXTRACT(MONTH FROM h.date) = EXTRACT(MONTH FROM p_date)
            AND EXTRACT(DAY   FROM h.date) = EXTRACT(DAY   FROM p_date))
      )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.hr_is_holiday(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_is_holiday(date) TO authenticated, service_role;

CREATE OR REPLACE VIEW public.hr_attendance_day_v AS
SELECT employee_id,
    attendance_date AS date,
    CASE
      WHEN public.hr_is_holiday(attendance_date)
           AND COALESCE(status, 'no_data') IN ('no_data', 'absent', 'no_punch')
           AND first_in IS NULL
        THEN 'holiday'
      ELSE COALESCE(status, 'no_data'::text)
    END AS status,
    first_in,
    last_out,
    COALESCE(net_work_minutes, 0) AS worked_minutes,
    COALESCE(break_minutes, 0) AS break_minutes,
    COALESCE(lunch_minutes, 0) AS lunch_minutes,
    COALESCE(late_by_minutes, 0) AS late_minutes,
    COALESCE(early_by_minutes, 0) AS early_minutes,
    COALESCE(is_late, false) AS is_late,
    COALESCE(total_hours, 0::numeric) AS total_hours,
    COALESCE(session_count, 0) AS session_count,
    COALESCE(suppressed_count, 0) AS suppressed_count,
    engine_version,
        CASE
            WHEN public.hr_is_holiday(attendance_date) AND first_in IS NULL THEN 0::numeric
            WHEN hr_stale_session_held(employee_id, attendance_date) THEN 0::numeric
            WHEN status = 'absent'::text THEN 1.0
            WHEN status = 'half_day'::text THEN 0.5
            ELSE 0::numeric
        END AS lop_contribution,
    hr_stale_session_held(employee_id, attendance_date) AS watchdog_held
   FROM hr_attendance_daily d;