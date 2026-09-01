DROP FUNCTION IF EXISTS public.hr_manager_leave_queue();
CREATE FUNCTION public.hr_manager_leave_queue()
RETURNS TABLE (
  id uuid, employee_id uuid, employee_name text, badge_id text, employee_email text,
  leave_type_name text, start_date date, end_date date, total_days numeric,
  is_half_day boolean, half_day_period text, reason text, status text,
  manager_status text, manager_remarks text, leave_clashes_count integer, created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id, l.employee_id,
         NULLIF(TRIM(COALESCE(e.first_name,'') || ' ' || COALESCE(e.last_name,'')), '') AS employee_name,
         e.badge_id::text,
         e.email::text,
         lt.name::text AS leave_type_name,
         l.start_date, l.end_date, l.total_days, l.is_half_day, l.half_day_period,
         l.reason, l.status::text, l.manager_status, l.manager_remarks,
         l.leave_clashes_count::int,
         l.created_at
  FROM public.hr_leave_requests l
  LEFT JOIN public.hr_employees e ON e.id = l.employee_id
  LEFT JOIN public.hr_leave_types lt ON lt.id = l.leave_type_id
  WHERE l.manager_id IS NOT NULL
    AND l.manager_id = public.hr_current_employee_id()
    AND l.status IN ('requested','manager_approved')
  ORDER BY l.created_at DESC
$$;
REVOKE EXECUTE ON FUNCTION public.hr_manager_leave_queue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_manager_leave_queue() TO authenticated;