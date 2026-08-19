DO $$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'daily-compoff-expiry'
  LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.fn_expire_compoff_allocations();

REVOKE ALL ON FUNCTION public.hr_compoff_month_pool(uuid[], date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_compoff_month_pool(uuid[], date) TO authenticated, service_role;