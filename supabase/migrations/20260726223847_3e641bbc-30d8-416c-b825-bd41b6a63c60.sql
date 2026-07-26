-- V1: Canonical attendance read layer

CREATE OR REPLACE FUNCTION public.hr_ess_current_employee_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.hr_employees WHERE user_id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.hr_ess_current_employee_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.hr_is_hr_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid()
      AND r.name IN ('Super Admin', 'Admin', 'HR Manager', 'COO')
  );
$$;

GRANT EXECUTE ON FUNCTION public.hr_is_hr_admin() TO authenticated;

CREATE OR REPLACE VIEW public.hr_attendance_day_v
WITH (security_invoker = on) AS
SELECT
  d.employee_id,
  d.attendance_date                                             AS date,
  COALESCE(d.status, 'no_data')                                 AS status,
  d.first_in,
  d.last_out,
  COALESCE(d.net_work_minutes, 0)::int                          AS worked_minutes,
  COALESCE(d.break_minutes, 0)::int                             AS break_minutes,
  COALESCE(d.lunch_minutes, 0)::int                             AS lunch_minutes,
  COALESCE(d.late_by_minutes, 0)::int                           AS late_minutes,
  COALESCE(d.early_by_minutes, 0)::int                          AS early_minutes,
  COALESCE(d.is_late, false)                                    AS is_late,
  COALESCE(d.total_hours, 0)::numeric                           AS total_hours,
  COALESCE(d.session_count, 0)::int                             AS session_count,
  COALESCE(d.suppressed_count, 0)::int                          AS suppressed_count,
  d.engine_version,
  CASE
    WHEN public.hr_stale_session_held(d.employee_id, d.attendance_date) THEN 0::numeric
    WHEN d.status = 'absent'   THEN 1.0::numeric
    WHEN d.status = 'half_day' THEN 0.5::numeric
    ELSE 0::numeric
  END                                                           AS lop_contribution,
  public.hr_stale_session_held(d.employee_id, d.attendance_date) AS watchdog_held
FROM public.hr_attendance_daily d;

COMMENT ON VIEW public.hr_attendance_day_v IS
  'V1 canonical read layer for attendance. All surfaces (ESS calendar, HR overview, HR day detail, payroll LOP) MUST read here — never from hr_attendance_daily / hr_lop_days directly.';

GRANT SELECT ON public.hr_attendance_day_v TO authenticated;

CREATE OR REPLACE FUNCTION public.hr_attendance_day_range(
  p_employee_ids uuid[],
  p_from date,
  p_to date
)
RETURNS SETOF public.hr_attendance_day_v
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.*
  FROM public.hr_attendance_day_v v
  WHERE v.date BETWEEN p_from AND p_to
    AND v.employee_id = ANY(p_employee_ids)
    AND (
      public.hr_is_hr_admin()
      OR v.employee_id = public.hr_ess_current_employee_id()
    );
$$;

GRANT EXECUTE ON FUNCTION public.hr_attendance_day_range(uuid[], date, date) TO authenticated;