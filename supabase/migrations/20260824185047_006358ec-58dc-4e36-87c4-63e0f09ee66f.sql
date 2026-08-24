CREATE INDEX IF NOT EXISTS idx_binance_ad_state_snapshots_advno_captured
  ON public.binance_ad_state_snapshots (adv_no, captured_at DESC);

CREATE OR REPLACE FUNCTION public.terminal_ad_zone_map()
RETURNS TABLE(adv_no text, zone text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (s.adv_no)
    s.adv_no,
    CASE WHEN lower(coalesce(s.raw_payload->>'classify', '')) = 'block' THEN 'block' ELSE 'p2p' END AS zone
  FROM public.binance_ad_state_snapshots s
  WHERE s.raw_payload ? 'classify'
  ORDER BY s.adv_no, s.captured_at DESC
$$;

REVOKE ALL ON FUNCTION public.terminal_ad_zone_map() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.terminal_ad_zone_map() TO authenticated;
GRANT EXECUTE ON FUNCTION public.terminal_ad_zone_map() TO service_role;