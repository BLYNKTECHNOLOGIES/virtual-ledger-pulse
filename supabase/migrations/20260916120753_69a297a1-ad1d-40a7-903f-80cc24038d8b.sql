CREATE OR REPLACE FUNCTION public.get_ad_uptime_timeline(
  p_date date,
  p_ad_class text DEFAULT NULL,
  p_account uuid DEFAULT NULL,
  p_bucket_minutes integer DEFAULT 5
)
RETURNS TABLE (
  bucket_start timestamptz,
  shift_key text,
  ads_expected integer,
  effective_ads numeric,
  hollow_ads numeric,
  offline_ads numeric,
  samples integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH per_minute AS (
    SELECT
      to_timestamp(floor(extract(epoch FROM m.minute) / (GREATEST(p_bucket_minutes, 1) * 60)) * GREATEST(p_bucket_minutes, 1) * 60) AS bucket_start,
      m.minute,
      m.shift_key,
      count(*) AS ads_total,
      count(*) FILTER (WHERE m.grade = 'effective') AS eff,
      count(*) FILTER (WHERE m.grade = 'hollow') AS hol,
      count(*) FILTER (WHERE m.grade = 'offline') AS off
    FROM public.terminal_ad_uptime_minutes m
    WHERE m.ist_date = p_date
      AND (p_ad_class IS NULL OR m.ad_class = p_ad_class)
      AND (p_account IS NULL OR m.exchange_account_id = p_account)
    GROUP BY 1, 2, 3
  )
  SELECT
    bucket_start,
    (array_agg(shift_key ORDER BY minute))[1] AS shift_key,
    max(ads_total)::integer AS ads_expected,
    round(avg(eff), 2) AS effective_ads,
    round(avg(hol), 2) AS hollow_ads,
    round(avg(off), 2) AS offline_ads,
    count(*)::integer AS samples
  FROM per_minute
  GROUP BY bucket_start
  ORDER BY bucket_start;
$$;

REVOKE ALL ON FUNCTION public.get_ad_uptime_timeline(date, text, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ad_uptime_timeline(date, text, uuid, integer) TO authenticated, service_role;