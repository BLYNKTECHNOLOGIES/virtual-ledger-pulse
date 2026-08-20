
-- ============================================================
-- Phase 1: remove anonymous execute rights on public routines
-- ============================================================

DO $$
DECLARE
  f record;
  keep text[] := ARRAY[
    'has_help_assistant_permission','has_permission','has_role','has_terminal_permission',
    'hr_current_employee_id','hr_doc_can_view_sensitive','hr_ess_current_employee_id',
    'hr_is_hr_admin','hr_is_hr_staff','is_ledger_auditor','is_manager',
    'mpi_can_manage','mpi_can_view','mpi_is_admin','user_has_permission','verify_terminal_access'
  ];
BEGIN
  FOR f IN
    SELECT p.oid,
           p.proname,
           format('public.%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid)) AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prokind = 'f'
  LOOP
    -- strip blanket rights first
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f.sig);

    -- logged-in users and internal services keep working
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);

    -- RLS predicate helpers must stay callable by anon so policy
    -- evaluation on anon requests fails closed (empty) instead of erroring
    IF f.proname = ANY(keep) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', f.sig);
    END IF;
  END LOOP;
END $$;

-- future routines are not auto-exposed to anonymous callers
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- ============================================================
-- Harden the three routines that leaked identity data
-- ============================================================

-- 1) staff email feed -> require a session
CREATE OR REPLACE FUNCTION public.get_active_users()
RETURNS TABLE(id uuid, username text, email text, first_name text, last_name text, last_activity timestamp with time zone, status text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  RETURN QUERY
  SELECT u.id, u.username, u.email, u.first_name, u.last_name, u.last_activity, u.status
    FROM public.users u
   WHERE u.last_activity > now() - interval '5 minutes'
     AND u.status = 'ACTIVE'
   ORDER BY u.last_activity DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_active_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_active_users() TO authenticated, service_role;

-- 2) employee directory -> require a session
CREATE OR REPLACE FUNCTION public.hr_org_chart_directory()
RETURNS TABLE(id uuid, first_name text, last_name text, profile_image_url text, department_id uuid, job_position_id uuid, job_role text, reporting_manager_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  RETURN QUERY
  SELECT e.id, e.first_name, e.last_name, e.profile_image_url,
         w.department_id, w.job_position_id, w.job_role, w.reporting_manager_id
    FROM public.hr_employees e
    LEFT JOIN public.hr_employee_work_info w ON w.employee_id = e.id
   WHERE e.is_active = true;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_org_chart_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_org_chart_directory() TO authenticated, service_role;

-- 3) legacy credential checker -> internal use only
REVOKE ALL ON FUNCTION public.validate_user_credentials(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_user_credentials(text, text) TO service_role;

-- 4) self-service registration routine is reached through an edge function
REVOKE ALL ON FUNCTION public.register_user_request(text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_user_request(text, text, text, text, text, text) TO service_role;
