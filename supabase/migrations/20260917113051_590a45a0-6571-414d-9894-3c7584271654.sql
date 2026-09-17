ALTER TABLE public.terminal_ad_uptime_shift_summary
  ADD COLUMN IF NOT EXISTS active_clock_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS private_only_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS offline_clock_minutes integer NOT NULL DEFAULT 0;

ALTER TABLE public.terminal_ad_uptime_monthly_summary
  ADD COLUMN IF NOT EXISTS active_clock_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS private_only_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS offline_clock_minutes integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.rollup_terminal_ad_uptime(p_date date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_rows integer := 0;
  v_all uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
  WITH raw AS (
    SELECT m.* FROM public.terminal_ad_uptime_minutes m
    WHERE m.ist_date = p_date AND m.shift_key IS NOT NULL
  ),
  grid AS (
    SELECT r.exchange_account_id AS acct, r.ad_class, r.shift_key, r.minute,
           count(*) FILTER (WHERE r.grade = 'active')  AS ads_active,
           count(*) FILTER (WHERE r.grade = 'private') AS ads_private,
           count(*) FILTER (WHERE r.grade = 'offline') AS ads_offline
    FROM raw r GROUP BY 1,2,3,4
    UNION ALL
    SELECT v_all, r.ad_class, r.shift_key, r.minute,
           count(*) FILTER (WHERE r.grade = 'active'),
           count(*) FILTER (WHERE r.grade = 'private'),
           count(*) FILTER (WHERE r.grade = 'offline')
    FROM raw r GROUP BY 2,3,4
  ),
  agg AS (
    SELECT
      g.acct, g.ad_class, g.shift_key,
      count(*) AS measured_minutes,
      count(*) FILTER (WHERE g.ads_active >= c.cap) AS full_coverage_minutes,
      count(*) FILTER (WHERE g.ads_active > 0 AND g.ads_active < c.cap) AS partial_coverage_minutes,
      count(*) FILTER (WHERE g.ads_active = 0) AS down_minutes,
      count(*) FILTER (WHERE g.ads_active = 1) AS minutes_one,
      count(*) FILTER (WHERE g.ads_active = 2) AS minutes_two,
      count(*) FILTER (WHERE g.ads_active >= 3) AS minutes_three_plus,
      count(*) FILTER (WHERE g.ads_active > 0) AS active_clock_minutes,
      count(*) FILTER (WHERE g.ads_active = 0 AND g.ads_private > 0) AS private_only_minutes,
      count(*) FILTER (WHERE g.ads_active = 0 AND g.ads_private = 0) AS offline_clock_minutes,
      max(g.ads_active) AS peak_concurrent,
      sum(g.ads_active) AS ad_active_minutes,
      sum(g.ads_private) AS ad_private_minutes,
      sum(g.ads_offline) AS ad_offline_minutes,
      c.cap AS concurrency_cap,
      avg(LEAST(g.ads_active, c.cap)::numeric / c.cap) FILTER (WHERE g.ads_active > 0) AS concurrency_ratio
    FROM grid g
    CROSS JOIN LATERAL (
      SELECT CASE g.ad_class
        WHEN 'lightning_small_sale' THEN 1
        WHEN 'small_sale' THEN 1
        WHEN 'big_sell' THEN 2
        WHEN 'big_buy' THEN 4
        ELSE 1 END AS cap
    ) c
    GROUP BY 1,2,3, c.cap
  ),
  episodes AS (
    SELECT exchange_account_id AS acct, ad_class, shift_key,
           jsonb_agg(episode ORDER BY started_at) AS downtime_episodes
    FROM (
      SELECT s.exchange_account_id, s.ad_class, s.shift_key, min(s.minute) AS started_at,
             jsonb_build_object(
               'adv_no', s.adv_no, 'from', min(s.minute), 'to', max(s.minute),
               'minutes', count(*), 'grade', s.grade,
               'asset', (array_agg(s.asset))[1], 'zone', (array_agg(s.zone))[1]
             ) AS episode
      FROM (
        SELECT x.exchange_account_id, x.ad_class, x.shift_key, x.adv_no, x.grade, x.minute, x.asset, x.zone,
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
    active_clock_minutes, private_only_minutes, offline_clock_minutes,
    full_coverage_minutes, partial_coverage_minutes, down_minutes,
    minutes_one, minutes_two, minutes_three_plus,
    peak_concurrent, concurrency_cap,
    expected_ads, uptime_pct, category_score, downtime_episodes
  )
  SELECT
    p_date, a.shift_key, a.ad_class, a.acct,
    COALESCE(w.window_minutes, a.measured_minutes),
    a.measured_minutes,
    GREATEST(COALESCE(w.window_minutes, a.measured_minutes) - a.measured_minutes, 0),
    a.ad_active_minutes, 0, a.ad_offline_minutes, a.ad_private_minutes,
    a.active_clock_minutes, a.private_only_minutes, a.offline_clock_minutes,
    a.full_coverage_minutes, a.partial_coverage_minutes, a.down_minutes,
    a.minutes_one, a.minutes_two, a.minutes_three_plus,
    a.peak_concurrent, a.concurrency_cap, a.concurrency_cap,
    CASE WHEN a.measured_minutes > 0
      THEN ROUND(100.0 * a.active_clock_minutes / a.measured_minutes, 2) ELSE 0 END,
    CASE WHEN a.measured_minutes > 0
      THEN ROUND(100.0 * (a.active_clock_minutes::numeric / a.measured_minutes)
                 * (0.8 + 0.2 * COALESCE(a.concurrency_ratio, 0)), 2) ELSE 0 END,
    COALESCE(ep.downtime_episodes, '[]'::jsonb)
  FROM agg a
  LEFT JOIN episodes ep ON ep.acct = a.acct AND ep.ad_class = a.ad_class AND ep.shift_key = a.shift_key
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
    active_clock_minutes = EXCLUDED.active_clock_minutes,
    private_only_minutes = EXCLUDED.private_only_minutes,
    offline_clock_minutes = EXCLUDED.offline_clock_minutes,
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
$fn$;

CREATE OR REPLACE FUNCTION public.rollup_terminal_ad_uptime_monthly(p_month date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_rows integer := 0;
  v_from date := date_trunc('month', p_month)::date;
  v_to date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
BEGIN
  INSERT INTO public.terminal_ad_uptime_monthly_summary AS t (
    month_start, shift_key, ad_class, exchange_account_id,
    days_counted, shift_minutes, measured_minutes, unmeasured_minutes,
    effective_minutes, private_minutes, offline_minutes, down_minutes,
    active_clock_minutes, private_only_minutes, offline_clock_minutes,
    minutes_one, minutes_two, minutes_three_plus,
    peak_concurrent, concurrency_cap, uptime_pct, category_score
  )
  SELECT
    v_from, s.shift_key, s.ad_class, s.exchange_account_id,
    count(DISTINCT s.ist_date),
    COALESCE(sum(s.shift_minutes), 0),
    COALESCE(sum(s.measured_minutes), 0),
    COALESCE(sum(s.unmeasured_minutes), 0),
    COALESCE(sum(s.effective_minutes), 0),
    COALESCE(sum(s.private_minutes), 0),
    COALESCE(sum(s.offline_minutes), 0),
    COALESCE(sum(s.down_minutes), 0),
    COALESCE(sum(s.active_clock_minutes), 0),
    COALESCE(sum(s.private_only_minutes), 0),
    COALESCE(sum(s.offline_clock_minutes), 0),
    COALESCE(sum(s.minutes_one), 0),
    COALESCE(sum(s.minutes_two), 0),
    COALESCE(sum(s.minutes_three_plus), 0),
    COALESCE(max(s.peak_concurrent), 0),
    GREATEST(COALESCE(max(s.concurrency_cap), 1), 1),
    CASE WHEN COALESCE(sum(s.measured_minutes), 0) > 0
      THEN ROUND(100.0 * sum(s.active_clock_minutes) / sum(s.measured_minutes), 2)
      ELSE 0 END,
    CASE WHEN COALESCE(sum(s.measured_minutes), 0) > 0
      THEN ROUND(sum(s.category_score * s.measured_minutes) / sum(s.measured_minutes), 2)
      ELSE 0 END
  FROM public.terminal_ad_uptime_shift_summary s
  WHERE s.ist_date BETWEEN v_from AND v_to
    AND s.ad_class IN ('lightning_small_sale','small_sale','big_sell','big_buy')
  GROUP BY 1,2,3,4
  ON CONFLICT (month_start, shift_key, ad_class, exchange_account_id) DO UPDATE SET
    days_counted = EXCLUDED.days_counted,
    shift_minutes = EXCLUDED.shift_minutes,
    measured_minutes = EXCLUDED.measured_minutes,
    unmeasured_minutes = EXCLUDED.unmeasured_minutes,
    effective_minutes = EXCLUDED.effective_minutes,
    private_minutes = EXCLUDED.private_minutes,
    offline_minutes = EXCLUDED.offline_minutes,
    down_minutes = EXCLUDED.down_minutes,
    active_clock_minutes = EXCLUDED.active_clock_minutes,
    private_only_minutes = EXCLUDED.private_only_minutes,
    offline_clock_minutes = EXCLUDED.offline_clock_minutes,
    minutes_one = EXCLUDED.minutes_one,
    minutes_two = EXCLUDED.minutes_two,
    minutes_three_plus = EXCLUDED.minutes_three_plus,
    peak_concurrent = EXCLUDED.peak_concurrent,
    concurrency_cap = EXCLUDED.concurrency_cap,
    uptime_pct = EXCLUDED.uptime_pct,
    category_score = EXCLUDED.category_score,
    updated_at = now();

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_ad_uptime_shift_score(p_from date, p_to date, p_account uuid DEFAULT NULL::uuid)
RETURNS TABLE (ist_date date, shift_key text, blended_score numeric, weight_covered numeric, categories jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  WITH weights(ad_class, weight) AS (
    VALUES ('lightning_small_sale', 15.0), ('small_sale', 15.0), ('big_sell', 30.0), ('big_buy', 40.0)
  ),
  src AS (
    SELECT s.*, w.weight,
           (s.exchange_account_id = '00000000-0000-0000-0000-000000000000'::uuid) AS is_pooled
    FROM public.terminal_ad_uptime_shift_summary s
    JOIN weights w ON w.ad_class = s.ad_class
    WHERE s.ist_date BETWEEN p_from AND p_to
      AND s.measured_minutes > 0
      AND (p_account IS NULL OR s.exchange_account_id = p_account)
  ),
  ranked AS (
    SELECT src.*,
           row_number() OVER (
             PARTITION BY src.ist_date, src.shift_key, src.ad_class
             ORDER BY src.is_pooled DESC, src.category_score DESC
           ) AS rn
    FROM src
  ),
  per_cat AS (
    SELECT ist_date, shift_key, ad_class, weight, category_score, peak_concurrent,
           private_only_minutes, measured_minutes, down_minutes
    FROM ranked WHERE rn = 1
  )
  SELECT
    per_cat.ist_date,
    per_cat.shift_key,
    ROUND(sum(per_cat.category_score * per_cat.weight) / NULLIF(sum(per_cat.weight), 0), 2),
    sum(per_cat.weight),
    jsonb_object_agg(per_cat.ad_class, jsonb_build_object(
      'score', per_cat.category_score, 'weight', per_cat.weight,
      'peak_concurrent', per_cat.peak_concurrent, 'private_minutes', per_cat.private_only_minutes,
      'measured_minutes', per_cat.measured_minutes, 'down_minutes', per_cat.down_minutes
    ))
  FROM per_cat
  GROUP BY 1,2
  ORDER BY 1,2;
$fn$;

CREATE OR REPLACE FUNCTION public.get_ad_uptime_monthly_score(p_month date, p_account uuid DEFAULT NULL::uuid)
RETURNS TABLE (month_start date, shift_key text, blended_score numeric, weight_covered numeric, categories jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  WITH weights(ad_class, weight) AS (
    VALUES ('lightning_small_sale', 15.0), ('small_sale', 15.0), ('big_sell', 30.0), ('big_buy', 40.0)
  ),
  src AS (
    SELECT m.*, w.weight,
           (m.exchange_account_id = '00000000-0000-0000-0000-000000000000'::uuid) AS is_pooled
    FROM public.terminal_ad_uptime_monthly_summary m
    JOIN weights w ON w.ad_class = m.ad_class
    WHERE m.month_start = date_trunc('month', p_month)::date
      AND m.measured_minutes > 0
      AND (p_account IS NULL OR m.exchange_account_id = p_account)
  ),
  ranked AS (
    SELECT src.*,
           row_number() OVER (
             PARTITION BY src.month_start, src.shift_key, src.ad_class
             ORDER BY src.is_pooled DESC, src.category_score DESC
           ) AS rn
    FROM src
  ),
  per_cat AS (
    SELECT month_start, shift_key, ad_class, weight, category_score, peak_concurrent,
           private_only_minutes, measured_minutes, down_minutes, days_counted
    FROM ranked WHERE rn = 1
  )
  SELECT
    per_cat.month_start,
    per_cat.shift_key,
    ROUND(sum(per_cat.category_score * per_cat.weight) / NULLIF(sum(per_cat.weight), 0), 2),
    sum(per_cat.weight),
    jsonb_object_agg(per_cat.ad_class, jsonb_build_object(
      'score', per_cat.category_score, 'weight', per_cat.weight,
      'peak_concurrent', per_cat.peak_concurrent, 'private_minutes', per_cat.private_only_minutes,
      'measured_minutes', per_cat.measured_minutes, 'down_minutes', per_cat.down_minutes,
      'days_counted', per_cat.days_counted
    ))
  FROM per_cat
  GROUP BY 1,2
  ORDER BY 1,2;
$fn$;

REVOKE ALL ON FUNCTION public.get_ad_uptime_shift_score(date, date, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_ad_uptime_monthly_score(date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ad_uptime_shift_score(date, date, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_ad_uptime_monthly_score(date, uuid) TO authenticated, service_role;