CREATE OR REPLACE FUNCTION public.rollup_terminal_ad_uptime(p_date date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rows integer := 0;
  v_all uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
  WITH raw AS (
    SELECT m.* FROM public.terminal_ad_uptime_minutes m
    JOIN public.terminal_exchange_accounts ea
      ON ea.id = m.exchange_account_id AND ea.ad_uptime_tracked
    WHERE m.ist_date = p_date AND m.shift_key IS NOT NULL
  ),
  slot_cfg AS (
    SELECT asset, zone, required_ads
    FROM public.terminal_ad_uptime_slot_targets
    WHERE is_active AND ad_class = 'big_buy'
  ),
  gridraw AS (
    SELECT r.exchange_account_id AS acct, r.ad_class, r.shift_key, r.minute,
           count(*) FILTER (WHERE r.grade = 'active')  AS ads_active,
           count(*) FILTER (WHERE r.grade = 'private') AS ads_private,
           count(*) FILTER (WHERE r.grade = 'offline') AS ads_offline,
           count(*) FILTER (WHERE r.grade = 'break')   AS ads_break
    FROM raw r GROUP BY 1,2,3,4
    UNION ALL
    SELECT v_all, r.ad_class, r.shift_key, r.minute,
           count(*) FILTER (WHERE r.grade = 'active'),
           count(*) FILTER (WHERE r.grade = 'private'),
           count(*) FILTER (WHERE r.grade = 'offline'),
           count(*) FILTER (WHERE r.grade = 'break')
    FROM raw r GROUP BY 2,3,4
  ),
  collected AS (
    SELECT DISTINCT r.exchange_account_id AS acct, r.shift_key, r.minute FROM raw r
    UNION
    SELECT DISTINCT v_all, r.shift_key, r.minute FROM raw r
  ),
  classes(ad_class) AS (
    VALUES ('lightning_small_sale'), ('small_sale'), ('big_sell'), ('big_buy')
  ),
  grid AS (
    SELECT c.acct, cl.ad_class, c.shift_key, c.minute,
           COALESCE(gr.ads_active, 0)  AS ads_active,
           COALESCE(gr.ads_private, 0) AS ads_private,
           COALESCE(gr.ads_offline, 0) AS ads_offline,
           COALESCE(gr.ads_break, 0)   AS ads_break
    FROM collected c
    CROSS JOIN classes cl
    LEFT JOIN gridraw gr
      ON gr.acct = c.acct AND gr.shift_key = c.shift_key
     AND gr.minute = c.minute AND gr.ad_class = cl.ad_class
  ),
  buy_groups AS (
    SELECT r.exchange_account_id AS acct, r.shift_key, r.minute, r.asset, r.zone,
           count(*) FILTER (WHERE r.grade = 'active') AS act
    FROM raw r WHERE r.ad_class = 'big_buy' GROUP BY 1,2,3,4,5
    UNION ALL
    SELECT v_all, r.shift_key, r.minute, r.asset, r.zone,
           count(*) FILTER (WHERE r.grade = 'active')
    FROM raw r WHERE r.ad_class = 'big_buy' GROUP BY 2,3,4,5
  ),
  buy_minutes AS (
    SELECT DISTINCT acct, shift_key, minute FROM grid WHERE ad_class = 'big_buy'
  ),
  buy_cover AS (
    SELECT bm.acct, bm.shift_key, bm.minute,
           sum(LEAST(COALESCE(bg.act, 0), c.required_ads))::numeric AS cov_num,
           sum(c.required_ads)::numeric AS cov_den
    FROM buy_minutes bm
    CROSS JOIN slot_cfg c
    LEFT JOIN buy_groups bg
      ON bg.acct = bm.acct AND bg.minute = bm.minute
     AND bg.asset = c.asset AND bg.zone = c.zone
    GROUP BY 1,2,3
  ),
  grid2 AS (
    SELECT g.*,
      CASE g.ad_class
        WHEN 'lightning_small_sale' THEN 1
        WHEN 'small_sale' THEN 1
        WHEN 'big_sell' THEN 2
        WHEN 'big_buy' THEN GREATEST(COALESCE(bc.cov_den, 4), 1)
        ELSE 1 END AS cap,
      CASE WHEN g.ad_class = 'big_buy'
        THEN COALESCE(bc.cov_num, 0)
        ELSE LEAST(g.ads_active, CASE g.ad_class
               WHEN 'big_sell' THEN 2 ELSE 1 END)::numeric
      END AS cov_num,
      CASE WHEN g.ad_class = 'big_buy'
        THEN GREATEST(COALESCE(bc.cov_den, 4), 1)::numeric
        ELSE (CASE g.ad_class WHEN 'big_sell' THEN 2 ELSE 1 END)::numeric
      END AS cov_den
    FROM grid g
    LEFT JOIN buy_cover bc
      ON g.ad_class = 'big_buy' AND bc.acct = g.acct
     AND bc.shift_key = g.shift_key AND bc.minute = g.minute
  ),
  agg AS (
    SELECT
      g.acct, g.ad_class, g.shift_key,
      count(*) AS measured_minutes,
      count(*) FILTER (WHERE g.cov_num >= g.cov_den) AS full_coverage_minutes,
      count(*) FILTER (WHERE g.cov_num > 0 AND g.cov_num < g.cov_den) AS partial_coverage_minutes,
      count(*) FILTER (WHERE g.ads_active = 0) AS down_minutes,
      count(*) FILTER (WHERE g.ads_active = 1) AS minutes_one,
      count(*) FILTER (WHERE g.ads_active = 2) AS minutes_two,
      count(*) FILTER (WHERE g.ads_active >= 3) AS minutes_three_plus,
      count(*) FILTER (WHERE g.ads_active > 0) AS active_clock_minutes,
      count(*) FILTER (WHERE g.ads_active = 0 AND g.ads_break > 0) AS break_clock_minutes,
      count(*) FILTER (WHERE g.ads_active = 0 AND g.ads_break = 0 AND g.ads_private > 0) AS private_only_minutes,
      count(*) FILTER (WHERE g.ads_active = 0 AND g.ads_break = 0 AND g.ads_private = 0) AS offline_clock_minutes,
      max(g.ads_active) AS peak_concurrent,
      sum(g.ads_active) AS ad_active_minutes,
      sum(g.ads_private) AS ad_private_minutes,
      sum(g.ads_offline) AS ad_offline_minutes,
      max(g.cap)::integer AS concurrency_cap,
      avg(g.cov_num / NULLIF(g.cov_den, 0)) AS depth_ratio
    FROM grid2 g
    GROUP BY 1,2,3
  ),
  episodes AS (
    SELECT exchange_account_id AS acct, ad_class, shift_key,
           jsonb_agg(episode ORDER BY started_at) AS downtime_episodes
    FROM (
      SELECT s.exchange_account_id, s.ad_class, s.shift_key, min(s.minute) AS started_at,
             jsonb_build_object(
               'adv_no', s.adv_no, 'from', min(s.minute), 'to', max(s.minute),
               'minutes', count(*), 'grade', s.grade,
               'asset', (array_agg(s.asset))[1], 'zone', (array_agg(s.zone))[1],
               'break_reason', (array_agg(s.break_reason))[1]
             ) AS episode
      FROM (
        SELECT x.exchange_account_id, x.ad_class, x.shift_key, x.adv_no, x.grade, x.minute, x.asset, x.zone,
               x.break_reason,
               sum(CASE WHEN x.grade = 'active' THEN 1 ELSE 0 END)
                 OVER (PARTITION BY x.exchange_account_id, x.adv_no ORDER BY x.minute) AS grp
        FROM public.terminal_ad_uptime_minutes x
        JOIN public.terminal_exchange_accounts ea2
          ON ea2.id = x.exchange_account_id AND ea2.ad_uptime_tracked
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
    active_clock_minutes, private_only_minutes, offline_clock_minutes, break_minutes,
    full_coverage_minutes, partial_coverage_minutes, down_minutes,
    minutes_one, minutes_two, minutes_three_plus,
    peak_concurrent, concurrency_cap,
    expected_ads, uptime_pct, category_score, downtime_episodes
  )
  SELECT
    p_date, a.shift_key, a.ad_class, a.acct,
    GREATEST(COALESCE(w.effective_minutes, a.measured_minutes), a.measured_minutes),
    a.measured_minutes,
    GREATEST(GREATEST(COALESCE(w.effective_minutes, a.measured_minutes), a.measured_minutes) - a.measured_minutes, 0),
    a.ad_active_minutes, 0, a.ad_offline_minutes, a.ad_private_minutes,
    a.active_clock_minutes, a.private_only_minutes, a.offline_clock_minutes, a.break_clock_minutes,
    a.full_coverage_minutes, a.partial_coverage_minutes, a.down_minutes,
    a.minutes_one, a.minutes_two, a.minutes_three_plus,
    a.peak_concurrent, a.concurrency_cap, a.concurrency_cap,
    CASE WHEN a.measured_minutes > 0
      THEN ROUND(100.0 * a.active_clock_minutes / a.measured_minutes, 2) ELSE 0 END,
    CASE WHEN a.measured_minutes > 0
      THEN ROUND(100.0 * COALESCE(a.depth_ratio, 0), 2) ELSE 0 END,
    COALESCE(ep.downtime_episodes, '[]'::jsonb)
  FROM agg a
  LEFT JOIN episodes ep ON ep.acct = a.acct AND ep.ad_class = a.ad_class AND ep.shift_key = a.shift_key
  LEFT JOIN LATERAL (
    SELECT LEAST(
      win.window_minutes,
      GREATEST(FLOOR(EXTRACT(EPOCH FROM (now() - win.shift_start)) / 60)::integer, 0)
    )::integer AS effective_minutes
    FROM (
      SELECT
        CASE
          WHEN sw.start_time < sw.end_time
            THEN EXTRACT(EPOCH FROM (sw.end_time - sw.start_time)) / 60
          ELSE EXTRACT(EPOCH FROM (interval '24 hours' - (sw.start_time - sw.end_time))) / 60
        END::integer AS window_minutes,
        ((p_date::timestamp + sw.start_time) AT TIME ZONE 'Asia/Kolkata') AS shift_start
      FROM public.terminal_shift_windows sw WHERE sw.shift_key = a.shift_key
    ) win
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
    break_minutes = EXCLUDED.break_minutes,
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