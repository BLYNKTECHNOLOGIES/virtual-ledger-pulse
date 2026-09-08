CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.refresh_terminal_order_rollups_job()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from bigint;
  v_to bigint;
BEGIN
  -- Refresh a rolling 50-day window (45-day seal boundary + 5-day safety overlap)
  v_from := (EXTRACT(EPOCH FROM (now() - INTERVAL '50 days')) * 1000)::bigint;
  v_to   := (EXTRACT(EPOCH FROM now()) * 1000)::bigint;
  PERFORM public.rebuild_terminal_order_rollups(v_from, v_to);
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_terminal_order_rollups_job() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_terminal_order_rollups_job() TO service_role;

SELECT cron.unschedule('refresh-terminal-order-rollups')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-terminal-order-rollups');

SELECT cron.schedule(
  'refresh-terminal-order-rollups',
  '7 */2 * * *',
  $$SELECT public.refresh_terminal_order_rollups_job();$$
);