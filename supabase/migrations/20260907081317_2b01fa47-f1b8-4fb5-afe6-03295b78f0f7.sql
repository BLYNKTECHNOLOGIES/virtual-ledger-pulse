-- 1) Push heartbeat changes over Realtime (the cache table was already added).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'terminal_collector_state'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.terminal_collector_state';
  END IF;
END $$;

ALTER TABLE public.terminal_collector_state REPLICA IDENTITY FULL;

-- 2) Server-computed freshness so browser clock skew can never fake staleness.
CREATE OR REPLACE FUNCTION public.terminal_collector_heartbeat()
RETURNS TABLE (
  last_tick_at timestamptz,
  last_status text,
  detail jsonb,
  heartbeat_age_seconds numeric,
  cache_age_seconds numeric,
  cached_orders integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.last_tick_at,
    s.last_status,
    s.detail,
    EXTRACT(EPOCH FROM (now() - s.last_tick_at))::numeric,
    (SELECT EXTRACT(EPOCH FROM (now() - max(c.updated_at)))::numeric FROM public.terminal_active_orders_cache c),
    (SELECT count(*)::int FROM public.terminal_active_orders_cache)
  FROM public.terminal_collector_state s
  WHERE s.id = 'active_orders';
$$;

GRANT EXECUTE ON FUNCTION public.terminal_collector_heartbeat() TO authenticated;