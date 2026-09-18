CREATE OR REPLACE FUNCTION public.get_ad_uptime_buy_slots(
  p_date date,
  p_shift text DEFAULT NULL,
  p_account uuid DEFAULT NULL
)
RETURNS TABLE(asset text, zone text, required_ads integer, slot_score numeric, peak_active integer, measured_minutes integer)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH mins AS (
    SELECT DISTINCT m.minute
    FROM public.terminal_ad_uptime_minutes m
    WHERE m.ist_date = p_date
      AND m.ad_class = 'big_buy'
      AND (p_shift IS NULL OR p_shift = 'all' OR m.shift_key = p_shift)
      AND (p_account IS NULL OR m.exchange_account_id = p_account)
  ),
  per_slot AS (
    SELECT m.minute, m.asset, m.zone, count(*) FILTER (WHERE m.grade = 'active') AS act
    FROM public.terminal_ad_uptime_minutes m
    WHERE m.ist_date = p_date
      AND m.ad_class = 'big_buy'
      AND (p_shift IS NULL OR p_shift = 'all' OR m.shift_key = p_shift)
      AND (p_account IS NULL OR m.exchange_account_id = p_account)
    GROUP BY 1, 2, 3
  )
  SELECT c.asset, c.zone, c.required_ads,
         ROUND(100.0 * avg(LEAST(COALESCE(s.act, 0), c.required_ads)::numeric / c.required_ads), 1) AS slot_score,
         COALESCE(max(s.act), 0)::integer AS peak_active,
         count(*)::integer AS measured_minutes
  FROM mins
  CROSS JOIN public.terminal_ad_uptime_slot_targets c
  LEFT JOIN per_slot s ON s.minute = mins.minute AND s.asset = c.asset AND s.zone = c.zone
  WHERE c.is_active AND c.ad_class = 'big_buy'
  GROUP BY c.asset, c.zone, c.required_ads
  ORDER BY slot_score, c.asset;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_ad_uptime_buy_slots(date, text, uuid) FROM anon;