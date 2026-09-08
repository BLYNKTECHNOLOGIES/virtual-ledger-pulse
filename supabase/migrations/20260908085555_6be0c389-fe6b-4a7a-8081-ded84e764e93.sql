CREATE OR REPLACE FUNCTION public.hr_team_milestones()
RETURNS TABLE(id uuid, first_name text, last_name text, badge_id text, dob_month int, dob_day int, joining_date date)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  RETURN QUERY
  SELECT e.id, e.first_name, e.last_name, e.badge_id,
         EXTRACT(MONTH FROM e.dob)::int, EXTRACT(DAY FROM e.dob)::int,
         w.joining_date
    FROM public.hr_employees e
    LEFT JOIN public.hr_employee_work_info w ON w.employee_id = e.id
   WHERE e.is_active = true;
END;
$function$;

REVOKE ALL ON FUNCTION public.hr_team_milestones() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_team_milestones() TO authenticated;