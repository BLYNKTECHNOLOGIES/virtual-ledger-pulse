CREATE OR REPLACE FUNCTION public.hr_manager_direct_reports()
RETURNS TABLE(
  employee_id uuid,
  full_name text,
  badge_id text,
  designation text,
  phone text,
  is_active boolean,
  pending_leave_with_me integer,
  pending_reg_with_me integer,
  pending_reg_with_hr integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH me AS (SELECT public.hr_current_employee_id() AS mid)
  SELECT
    e.id,
    NULLIF(TRIM(COALESCE(e.first_name,'') || ' ' || COALESCE(e.last_name,'')), '') AS full_name,
    e.badge_id::text,
    COALESCE(p.title, wi.job_role)::text AS designation,
    e.phone::text,
    e.is_active,
    (SELECT COUNT(*) FROM public.hr_leave_requests l
       WHERE l.employee_id = e.id
         AND l.manager_id = (SELECT mid FROM me)
         AND l.status IN ('requested','manager_approved'))::int,
    (SELECT COUNT(*) FROM public.hr_attendance_regularization_requests r
       WHERE r.employee_id = e.id
         AND r.manager_id = (SELECT mid FROM me)
         AND r.status IN ('manager_review','manager_reviewed'))::int,
    (SELECT COUNT(*) FROM public.hr_attendance_regularization_requests r
       WHERE r.employee_id = e.id
         AND r.status = 'pending')::int
  FROM public.hr_employee_work_info wi
  JOIN public.hr_employees e ON e.id = wi.employee_id
  LEFT JOIN public.positions p ON p.id = wi.job_position_id
  WHERE (SELECT mid FROM me) IS NOT NULL
    AND wi.reporting_manager_id = (SELECT mid FROM me)
  ORDER BY e.is_active DESC, full_name
$$;

REVOKE ALL ON FUNCTION public.hr_manager_direct_reports() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_manager_direct_reports() TO authenticated;