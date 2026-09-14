CREATE OR REPLACE FUNCTION public.compact_ad_state_snapshots()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_lock(727272);
  EXECUTE 'VACUUM (FULL, ANALYZE) public.binance_ad_state_snapshots';
  PERFORM pg_catalog.pg_advisory_unlock(727272);
END;
$$;
REVOKE ALL ON FUNCTION public.compact_ad_state_snapshots() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compact_ad_state_snapshots() TO service_role;
-- One-shot: runs tonight at 23:05 UTC (04:35 IST), off-peak.
SELECT cron.schedule('compact-ad-snapshots-once', '5 23 13 9 *', $cron$ SELECT public.compact_ad_state_snapshots(); $cron$);