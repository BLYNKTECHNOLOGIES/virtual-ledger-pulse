ALTER FUNCTION public.indian_financial_year SET search_path = public;
ALTER FUNCTION public.tg_hr_attendance_sessions_touch() SET search_path = public;
ALTER FUNCTION public.mpi_set_updated_at() SET search_path = public;
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace
    WHERE s.nspname='public' AND p.prosecdef AND has_function_privilege('anon',p.oid,'EXECUTE')
      AND p.proname <> 'describe_terminal_biometric_invite'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f.sig);
  END LOOP;
END $$;