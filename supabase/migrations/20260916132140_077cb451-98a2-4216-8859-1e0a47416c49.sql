-- 1. Monthly pre-aggregated summary (built from shift summaries, never from raw minutes)
CREATE TABLE IF NOT EXISTS public.terminal_ad_uptime_monthly_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month_start date NOT NULL,
  shift_key text NOT NULL,
  ad_class text NOT NULL,
  exchange_account_id uuid NOT NULL,
  days_counted integer NOT NULL DEFAULT 0,
  shift_minutes integer NOT NULL DEFAULT 0,
  measured_minutes integer NOT NULL DEFAULT 0,
  unmeasured_minutes integer NOT NULL DEFAULT 0,
  effective_minutes integer NOT NULL DEFAULT 0,
  private_minutes integer NOT NULL DEFAULT 0,
  offline_minutes integer NOT NULL DEFAULT 0,
  down_minutes integer NOT NULL DEFAULT 0,
  minutes_one integer NOT NULL DEFAULT 0,
  minutes_two integer NOT NULL DEFAULT 0,
  minutes_three_plus integer NOT NULL DEFAULT 0,
  peak_concurrent integer NOT NULL DEFAULT 0,
  concurrency_cap integer NOT NULL DEFAULT 1,
  uptime_pct numeric NOT NULL DEFAULT 0,
  category_score numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT terminal_ad_uptime_monthly_uniq UNIQUE (month_start, shift_key, ad_class, exchange_account_id)
);

GRANT SELECT ON public.terminal_ad_uptime_monthly_summary TO authenticated;
GRANT ALL ON public.terminal_ad_uptime_monthly_summary TO service_role;
ALTER TABLE public.terminal_ad_uptime_monthly_summary ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ad uptime monthly readable" ON public.terminal_ad_uptime_monthly_summary;
CREATE POLICY "ad uptime monthly readable"
  ON public.terminal_ad_uptime_monthly_summary FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_ad_uptime_monthly_month ON public.terminal_ad_uptime_monthly_summary (month_start, shift_key);

-- 2. Monthly rollup from shift summaries only (cheap: reads ~90 rows/day, no raw scan)
CREATE OR REPLACE FUNCTION public.rollup_terminal_ad_uptime_monthly(p_month date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_rows integer := 0;
  v_from date := date_trunc('month', p_month)::date;
  v_to date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
BEGIN
  INSERT INTO public.terminal_ad_uptime_monthly_summary AS t (
    month_start, shift_key, ad_class, exchange_account_id,
    days_counted, shift_minutes, measured_minutes, unmeasured_minutes,
    effective_minutes, private_minutes, offline_minutes, down_minutes,
    minutes_one, minutes_two, minutes_three_plus,
    peak_concurrent, concurrency_cap, uptime_pct, category_score
  )
  SELECT
    v_from,
    s.shift_key,
    s.ad_class,
    s.exchange_account_id,
    count(DISTINCT s.ist_date),
    COALESCE(sum(s.shift_minutes), 0),
    COALESCE(sum(s.measured_minutes), 0),
    COALESCE(sum(s.unmeasured_minutes), 0),
    COALESCE(sum(s.effective_minutes), 0),
    COALESCE(sum(s.private_minutes), 0),
    COALESCE(sum(s.offline_minutes), 0),
    COALESCE(sum(s.down_minutes), 0),
    COALESCE(sum(s.minutes_one), 0),
    COALESCE(sum(s.minutes_two), 0),
    COALESCE(sum(s.minutes_three_plus), 0),
    COALESCE(max(s.peak_concurrent), 0),
    GREATEST(COALESCE(max(s.concurrency_cap), 1), 1),
    CASE WHEN COALESCE(sum(s.measured_minutes), 0) > 0
      THEN ROUND(100.0 * (sum(s.measured_minutes) - sum(s.down_minutes)) / sum(s.measured_minutes), 2)
      ELSE 0 END,
    -- category score = measured-minute weighted average of the daily category scores
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
$$;

REVOKE ALL ON FUNCTION public.rollup_terminal_ad_uptime_monthly(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rollup_terminal_ad_uptime_monthly(date) TO service_role;

-- 3. Monthly blended score (same weights as the shift score) — reads only monthly rows
CREATE OR REPLACE FUNCTION public.get_ad_uptime_monthly_score(p_month date, p_account uuid DEFAULT NULL::uuid)
RETURNS TABLE(month_start date, shift_key text, blended_score numeric, weight_covered numeric, categories jsonb)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH weights(ad_class, weight) AS (
    VALUES ('lightning_small_sale', 15.0), ('small_sale', 15.0), ('big_sell', 30.0), ('big_buy', 40.0)
  ),
  per_cat AS (
    SELECT
      m.month_start,
      m.shift_key,
      m.ad_class,
      w.weight,
      max(m.category_score) AS category_score,
      max(m.peak_concurrent) AS peak_concurrent,
      sum(m.private_minutes) AS private_minutes,
      sum(m.measured_minutes) AS measured_minutes,
      sum(m.down_minutes) AS down_minutes,
      max(m.days_counted) AS days_counted
    FROM public.terminal_ad_uptime_monthly_summary m
    JOIN weights w ON w.ad_class = m.ad_class
    WHERE m.month_start = date_trunc('month', p_month)::date
      AND (p_account IS NULL OR m.exchange_account_id = p_account)
    GROUP BY 1,2,3,4
  )
  SELECT
    month_start,
    shift_key,
    ROUND(sum(category_score * weight) / NULLIF(sum(weight), 0), 2) AS blended_score,
    sum(weight) AS weight_covered,
    jsonb_object_agg(ad_class, jsonb_build_object(
      'score', category_score, 'weight', weight,
      'peak_concurrent', peak_concurrent, 'private_minutes', private_minutes,
      'measured_minutes', measured_minutes, 'down_minutes', down_minutes,
      'days_counted', days_counted
    )) AS categories
  FROM per_cat
  GROUP BY 1,2
  ORDER BY 1,2;
$$;

GRANT EXECUTE ON FUNCTION public.get_ad_uptime_monthly_score(date, uuid) TO authenticated, service_role;

-- 4. Housekeeping: raw minutes only need to survive long enough to be rolled up
CREATE OR REPLACE FUNCTION public.prune_terminal_ad_uptime_raw(p_retain_days integer DEFAULT 4)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cutoff date := ((now() AT TIME ZONE 'Asia/Kolkata')::date - GREATEST(p_retain_days, 2));
  v_minutes bigint := 0;
  v_runs bigint := 0;
BEGIN
  DELETE FROM public.terminal_ad_uptime_minutes WHERE ist_date < v_cutoff;
  GET DIAGNOSTICS v_minutes = ROW_COUNT;

  DELETE FROM public.terminal_ad_uptime_runs WHERE minute < (now() - (GREATEST(p_retain_days, 2) || ' days')::interval);
  GET DIAGNOSTICS v_runs = ROW_COUNT;

  RETURN jsonb_build_object('cutoff_ist_date', v_cutoff, 'minutes_deleted', v_minutes, 'runs_deleted', v_runs);
END;
$$;

REVOKE ALL ON FUNCTION public.prune_terminal_ad_uptime_raw(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prune_terminal_ad_uptime_raw(integer) TO service_role;

-- 5. Keep the concurrency cap correct after raw minutes are pruned:
--    remember the best simultaneous count already recorded in earlier shift summaries.
CREATE OR REPLACE FUNCTION public.rollup_terminal_ad_uptime(p_date date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  raw_caps AS (
    SELECT exchange_account_id, ad_class, max(ads_active) AS cap
    FROM (
      SELECT m.exchange_account_id, m.ad_class, m.minute,
             count(*) FILTER (WHERE m.grade = 'active') AS ads_active
      FROM public.terminal_ad_uptime_minutes m
      WHERE m.ist_date BETWEEN (p_date - 6) AND p_date
      GROUP BY 1,2,3
    ) q
    GROUP BY 1,2
  ),
  hist_caps AS (
    SELECT s.exchange_account_id, s.ad_class, max(s.peak_concurrent) AS cap
    FROM public.terminal_ad_uptime_shift_summary s
    WHERE s.ist_date BETWEEN (p_date - 6) AND p_date
    GROUP BY 1,2
  ),
  caps AS (
    SELECT
      COALESCE(r.exchange_account_id, h.exchange_account_id) AS exchange_account_id,
      COALESCE(r.ad_class, h.ad_class) AS ad_class,
      GREATEST(COALESCE(r.cap, 0), COALESCE(h.cap, 0), 1) AS cap
    FROM raw_caps r
    FULL JOIN hist_caps h ON h.exchange_account_id = r.exchange_account_id AND h.ad_class = r.ad_class
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
    CASE WHEN a.measured_minutes > 0
      THEN ROUND(100.0 * (a.measured_minutes - a.down_minutes) / a.measured_minutes, 2)
      ELSE 0 END,
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
$$;

REVOKE ALL ON FUNCTION public.rollup_terminal_ad_uptime(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rollup_terminal_ad_uptime(date) TO service_role;