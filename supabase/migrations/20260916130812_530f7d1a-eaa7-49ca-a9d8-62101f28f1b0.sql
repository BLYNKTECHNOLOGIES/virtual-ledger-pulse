-- 1. Minute-level: privacy, zone, payment methods
ALTER TABLE public.terminal_ad_uptime_minutes
  ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS zone text,
  ADD COLUMN IF NOT EXISTS pay_methods text[];

-- Re-label history: online-but-untradable is now simply active (privacy was not measured before)
UPDATE public.terminal_ad_uptime_minutes
   SET grade = 'active'
 WHERE grade IN ('effective', 'hollow');

UPDATE public.terminal_ad_uptime_minutes
   SET ad_class = CASE
     WHEN side = 'BUY' THEN 'big_buy'
     WHEN ad_class = 'small_sale' THEN 'small_sale'
     ELSE 'big_sell'
   END
 WHERE ad_class IN ('buy', 'sell', 'small_sale');

-- 2. Shift summary: private minutes, concurrency buckets, per-category score
ALTER TABLE public.terminal_ad_uptime_shift_summary
  ADD COLUMN IF NOT EXISTS private_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS minutes_one integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS minutes_two integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS minutes_three_plus integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS peak_concurrent integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS concurrency_cap integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS category_score numeric NOT NULL DEFAULT 0;

-- 3. Rollup rewrite
CREATE OR REPLACE FUNCTION public.rollup_terminal_ad_uptime(p_date date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rows integer := 0;
BEGIN
  WITH minute_grid AS (
    SELECT
      m.exchange_account_id,
      m.ad_class,
      m.shift_key,
      m.minute,
      count(*) AS ads_total,
      count(*) FILTER (WHERE m.grade = 'active') AS ads_active,
      count(*) FILTER (WHERE m.grade = 'private') AS ads_private,
      count(*) FILTER (WHERE m.grade = 'offline') AS ads_offline
    FROM public.terminal_ad_uptime_minutes m
    WHERE m.ist_date = p_date AND m.shift_key IS NOT NULL
    GROUP BY 1,2,3,4
  ),
  -- Bonus cap: best simultaneous active count seen for this category/account in the trailing 7 days
  caps AS (
    SELECT exchange_account_id, ad_class, GREATEST(max(ads_active), 1) AS cap
    FROM (
      SELECT m.exchange_account_id, m.ad_class, m.minute,
             count(*) FILTER (WHERE m.grade = 'active') AS ads_active
      FROM public.terminal_ad_uptime_minutes m
      WHERE m.ist_date BETWEEN (p_date - 6) AND p_date
      GROUP BY 1,2,3
    ) q
    GROUP BY 1,2
  ),
  agg AS (
    SELECT
      g.exchange_account_id,
      g.ad_class,
      g.shift_key,
      count(*) AS measured_minutes,
      count(*) FILTER (WHERE g.ads_active >= c.cap AND g.ads_active > 0) AS full_coverage_minutes,
      count(*) FILTER (WHERE g.ads_active > 0 AND g.ads_active < c.cap) AS partial_coverage_minutes,
      count(*) FILTER (WHERE g.ads_active = 0) AS down_minutes,
      count(*) FILTER (WHERE g.ads_active = 1) AS minutes_one,
      count(*) FILTER (WHERE g.ads_active = 2) AS minutes_two,
      count(*) FILTER (WHERE g.ads_active >= 3) AS minutes_three_plus,
      max(g.ads_active) AS peak_concurrent,
      sum(g.ads_active) AS ad_active_minutes,
      sum(g.ads_private) AS ad_private_minutes,
      sum(g.ads_offline) AS ad_offline_minutes,
      c.cap AS concurrency_cap,
      -- average fill of the (capped) concurrency target across measured minutes
      avg(LEAST(g.ads_active, c.cap)::numeric / c.cap) AS concurrency_ratio
    FROM minute_grid g
    JOIN caps c USING (exchange_account_id, ad_class)
    GROUP BY 1,2,3, c.cap
  ),
  episodes AS (
    SELECT
      exchange_account_id, ad_class, shift_key,
      jsonb_agg(episode ORDER BY started_at) AS downtime_episodes
    FROM (
      SELECT
        s.exchange_account_id, s.ad_class, s.shift_key, min(s.minute) AS started_at,
        jsonb_build_object(
          'adv_no', s.adv_no,
          'from', min(s.minute),
          'to', max(s.minute),
          'minutes', count(*),
          'grade', s.grade,
          'asset', (array_agg(s.asset))[1],
          'zone', (array_agg(s.zone))[1]
        ) AS episode
      FROM (
        SELECT
          x.exchange_account_id, x.ad_class, x.shift_key, x.adv_no, x.grade, x.minute, x.asset, x.zone,
          sum(CASE WHEN x.grade = 'active' THEN 1 ELSE 0 END)
            OVER (PARTITION BY x.exchange_account_id, x.adv_no ORDER BY x.minute) AS grp
        FROM public.terminal_ad_uptime_minutes x
        WHERE x.ist_date = p_date AND x.shift_key IS NOT NULL AND x.grade <> 'active'
      ) s
      GROUP BY s.exchange_account_id, s.ad_class, s.shift_key, s.adv_no, s.grade, s.grp
      HAVING count(*) >= 2
    ) eps
    GROUP BY 1,2,3
  )
  INSERT INTO public.terminal_ad_uptime_shift_summary AS t (
    ist_date, shift_key, ad_class, exchange_account_id,
    shift_minutes, measured_minutes, unmeasured_minutes,
    effective_minutes, hollow_minutes, offline_minutes, private_minutes,
    full_coverage_minutes, partial_coverage_minutes, down_minutes,
    minutes_one, minutes_two, minutes_three_plus,
    peak_concurrent, concurrency_cap,
    expected_ads, uptime_pct, category_score, downtime_episodes
  )
  SELECT
    p_date,
    a.shift_key,
    a.ad_class,
    a.exchange_account_id,
    COALESCE(w.window_minutes, a.measured_minutes),
    a.measured_minutes,
    GREATEST(COALESCE(w.window_minutes, a.measured_minutes) - a.measured_minutes, 0),
    a.ad_active_minutes,
    0,
    a.ad_offline_minutes,
    a.ad_private_minutes,
    a.full_coverage_minutes,
    a.partial_coverage_minutes,
    a.down_minutes,
    a.minutes_one,
    a.minutes_two,
    a.minutes_three_plus,
    a.peak_concurrent,
    a.concurrency_cap,
    a.concurrency_cap,
    -- uptime = share of measured minutes with at least one active (online + public) ad
    CASE WHEN a.measured_minutes > 0
      THEN ROUND(100.0 * (a.measured_minutes - a.down_minutes) / a.measured_minutes, 2)
      ELSE 0 END,
    -- category score = uptime, lifted by how well the concurrency target was filled
    CASE WHEN a.measured_minutes > 0
      THEN ROUND(
        100.0 * ((a.measured_minutes - a.down_minutes)::numeric / a.measured_minutes)
             * (0.8 + 0.2 * COALESCE(a.concurrency_ratio, 0)), 2)
      ELSE 0 END,
    COALESCE(ep.downtime_episodes, '[]'::jsonb)
  FROM agg a
  LEFT JOIN episodes ep USING (exchange_account_id, ad_class, shift_key)
  LEFT JOIN LATERAL (
    SELECT CASE
      WHEN sw.start_time < sw.end_time
        THEN EXTRACT(EPOCH FROM (sw.end_time - sw.start_time)) / 60
      ELSE EXTRACT(EPOCH FROM (interval '24 hours' - (sw.start_time - sw.end_time))) / 60
    END::integer AS window_minutes
    FROM public.terminal_shift_windows sw WHERE sw.shift_key = a.shift_key
  ) w ON true
  ON CONFLICT (ist_date, shift_key, ad_class, exchange_account_id) DO UPDATE SET
    shift_minutes = EXCLUDED.shift_minutes,
    measured_minutes = EXCLUDED.measured_minutes,
    unmeasured_minutes = EXCLUDED.unmeasured_minutes,
    effective_minutes = EXCLUDED.effective_minutes,
    hollow_minutes = EXCLUDED.hollow_minutes,
    offline_minutes = EXCLUDED.offline_minutes,
    private_minutes = EXCLUDED.private_minutes,
    full_coverage_minutes = EXCLUDED.full_coverage_minutes,
    partial_coverage_minutes = EXCLUDED.partial_coverage_minutes,
    down_minutes = EXCLUDED.down_minutes,
    minutes_one = EXCLUDED.minutes_one,
    minutes_two = EXCLUDED.minutes_two,
    minutes_three_plus = EXCLUDED.minutes_three_plus,
    peak_concurrent = EXCLUDED.peak_concurrent,
    concurrency_cap = EXCLUDED.concurrency_cap,
    expected_ads = EXCLUDED.expected_ads,
    uptime_pct = EXCLUDED.uptime_pct,
    category_score = EXCLUDED.category_score,
    downtime_episodes = EXCLUDED.downtime_episodes,
    updated_at = now();

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$function$;

-- 4. Timeline RPC: active / private / offline
DROP FUNCTION IF EXISTS public.get_ad_uptime_timeline(date, text, uuid, integer);
CREATE OR REPLACE FUNCTION public.get_ad_uptime_timeline(p_date date, p_ad_class text DEFAULT NULL::text, p_account uuid DEFAULT NULL::uuid, p_bucket_minutes integer DEFAULT 5)
 RETURNS TABLE(bucket_start timestamp with time zone, shift_key text, ads_expected integer, active_ads numeric, private_ads numeric, offline_ads numeric, samples integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH per_minute AS (
    SELECT
      to_timestamp(floor(extract(epoch FROM m.minute) / (GREATEST(p_bucket_minutes, 1) * 60)) * GREATEST(p_bucket_minutes, 1) * 60) AS bucket_start,
      m.minute,
      m.shift_key,
      count(*) AS ads_total,
      count(*) FILTER (WHERE m.grade = 'active') AS act,
      count(*) FILTER (WHERE m.grade = 'private') AS priv,
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
    round(avg(act), 2) AS active_ads,
    round(avg(priv), 2) AS private_ads,
    round(avg(off), 2) AS offline_ads,
    count(*)::integer AS samples
  FROM per_minute
  GROUP BY bucket_start
  ORDER BY bucket_start;
$function$;

-- 5. Blended shift score: Lightning 15, Small sale 15, Big sell 30, Big buy 40
CREATE OR REPLACE FUNCTION public.get_ad_uptime_shift_score(p_from date, p_to date, p_account uuid DEFAULT NULL::uuid)
 RETURNS TABLE(ist_date date, shift_key text, blended_score numeric, weight_covered numeric, categories jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH weights(ad_class, weight) AS (
    VALUES ('lightning_small_sale', 15.0), ('small_sale', 15.0), ('big_sell', 30.0), ('big_buy', 40.0)
  ),
  per_cat AS (
    SELECT
      s.ist_date,
      s.shift_key,
      s.ad_class,
      w.weight,
      -- account-agnostic: best score across accounts for the same category
      max(s.category_score) AS category_score,
      max(s.peak_concurrent) AS peak_concurrent,
      sum(s.private_minutes) AS private_minutes
    FROM public.terminal_ad_uptime_shift_summary s
    JOIN weights w ON w.ad_class = s.ad_class
    WHERE s.ist_date BETWEEN p_from AND p_to
      AND (p_account IS NULL OR s.exchange_account_id = p_account)
    GROUP BY 1,2,3,4
  )
  SELECT
    ist_date,
    shift_key,
    ROUND(sum(category_score * weight) / NULLIF(sum(weight), 0), 2) AS blended_score,
    sum(weight) AS weight_covered,
    jsonb_object_agg(ad_class, jsonb_build_object(
      'score', category_score, 'weight', weight,
      'peak_concurrent', peak_concurrent, 'private_minutes', private_minutes
    )) AS categories
  FROM per_cat
  GROUP BY 1,2
  ORDER BY 1,2;
$function$;

GRANT EXECUTE ON FUNCTION public.get_ad_uptime_timeline(date, text, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ad_uptime_shift_score(date, date, uuid) TO authenticated;