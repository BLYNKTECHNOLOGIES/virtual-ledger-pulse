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
      -- Depth fulfilment measured only over live minutes; downtime is already
      -- captured by uptime, so it must not be penalised a second time here.
      avg(LEAST(g.ads_active, c.cap)::numeric / c.cap) FILTER (WHERE g.ads_active > 0) AS concurrency_ratio
    FROM minute_grid g
    CROSS JOIN LATERAL (
      -- Policy targets agreed with the desk: expected simultaneous ads per category.
      SELECT CASE g.ad_class
        WHEN 'lightning_small_sale' THEN 1
        WHEN 'small_sale' THEN 1
        WHEN 'big_sell' THEN 2
        WHEN 'big_buy' THEN 4
        ELSE 1
      END AS cap
    ) c
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