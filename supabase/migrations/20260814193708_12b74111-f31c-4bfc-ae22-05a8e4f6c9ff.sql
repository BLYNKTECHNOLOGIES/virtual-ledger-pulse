CREATE OR REPLACE FUNCTION public.hr_org_chart_directory()
RETURNS TABLE (
  id uuid,
  first_name text,
  last_name text,
  profile_image_url text,
  department_id uuid,
  job_position_id uuid,
  job_role text,
  reporting_manager_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id,
         e.first_name,
         e.last_name,
         e.profile_image_url,
         w.department_id,
         w.job_position_id,
         w.job_role,
         w.reporting_manager_id
  FROM public.hr_employees e
  LEFT JOIN public.hr_employee_work_info w ON w.employee_id = e.id
  WHERE e.is_active = true
$$;

REVOKE ALL ON FUNCTION public.hr_org_chart_directory() FROM public;
GRANT EXECUTE ON FUNCTION public.hr_org_chart_directory() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_org_chart_directory() TO service_role;