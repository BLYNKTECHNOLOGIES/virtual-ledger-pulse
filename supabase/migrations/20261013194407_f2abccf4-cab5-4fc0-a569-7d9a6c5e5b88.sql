DO $do$
BEGIN
  ALTER FUNCTION public.hr_workforce_leaving_soon() RENAME TO hr_wf_leaving_soon_core;
  REVOKE ALL ON FUNCTION public.hr_wf_leaving_soon_core() FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.hr_wf_leaving_soon_core() TO service_role;
END $do$;
CREATE FUNCTION public.hr_workforce_leaving_soon()
RETURNS TABLE(employee_id uuid, department_id uuid, position_id uuid, plan_id uuid, last_working_day date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF NOT public.hr_is_hr_staff(auth.uid()) THEN RAISE EXCEPTION 'Only HR staff can view workforce planning' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT * FROM public.hr_wf_leaving_soon_core();
END $$;
REVOKE ALL ON FUNCTION public.hr_workforce_leaving_soon() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_workforce_leaving_soon() TO authenticated, service_role;