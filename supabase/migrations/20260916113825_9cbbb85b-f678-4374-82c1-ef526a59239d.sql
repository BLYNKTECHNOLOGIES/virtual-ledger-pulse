-- 1. Shift windows -----------------------------------------------------------
CREATE TABLE public.terminal_shift_windows (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shift_key text NOT NULL UNIQUE,
  shift_name text NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.terminal_shift_windows TO authenticated;
GRANT ALL ON public.terminal_shift_windows TO service_role;
ALTER TABLE public.terminal_shift_windows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shift windows readable by staff"
  ON public.terminal_shift_windows FOR SELECT TO authenticated USING (true);
CREATE POLICY "shift windows managed by shift admins"
  ON public.terminal_shift_windows FOR ALL TO authenticated
  USING (public.has_terminal_permission(auth.uid(), 'terminal_shift_manage'::terminal_permission))
  WITH CHECK (public.has_terminal_permission(auth.uid(), 'terminal_shift_manage'::terminal_permission));

INSERT INTO public.terminal_shift_windows (shift_key, shift_name, start_time, end_time, sort_order)
VALUES
  ('morning', 'Morning', '06:00', '14:00', 1),
  ('evening', 'Evening', '14:00', '22:00', 2),
  ('night',   'Night',   '22:00', '06:00', 3);

-- 2. Minute-level ad state ----------------------------------------------------
CREATE TABLE public.terminal_ad_uptime_minutes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  minute timestamptz NOT NULL,
  adv_no text NOT NULL,
  exchange_account_id uuid NOT NULL,
  side text NOT NULL,
  ad_class text NOT NULL,
  asset text,
  is_online boolean NOT NULL DEFAULT false,
  adv_status integer,
  surplus_amount numeric,
  min_single_trans_amount numeric,
  max_single_trans_amount numeric,
  pay_method_count integer,
  price numeric,
  market_ref_price numeric,
  price_gap_pct numeric,
  grade text NOT NULL,
  hollow_reasons text[] NOT NULL DEFAULT '{}',
  ist_date date NOT NULL,
  shift_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT terminal_ad_uptime_minutes_unique UNIQUE (adv_no, exchange_account_id, minute)
);

CREATE INDEX idx_ad_uptime_minutes_date_shift ON public.terminal_ad_uptime_minutes (ist_date, shift_key, ad_class);
CREATE INDEX idx_ad_uptime_minutes_minute ON public.terminal_ad_uptime_minutes (minute DESC);

GRANT SELECT ON public.terminal_ad_uptime_minutes TO authenticated;
GRANT ALL ON public.terminal_ad_uptime_minutes TO service_role;
ALTER TABLE public.terminal_ad_uptime_minutes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ad uptime minutes readable by staff"
  ON public.terminal_ad_uptime_minutes FOR SELECT TO authenticated USING (true);

-- 3. Collector heartbeat ------------------------------------------------------
CREATE TABLE public.terminal_ad_uptime_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  minute timestamptz NOT NULL,
  exchange_account_id uuid NOT NULL,
  ads_seen integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ok',
  error_text text,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT terminal_ad_uptime_runs_unique UNIQUE (minute, exchange_account_id)
);

CREATE INDEX idx_ad_uptime_runs_minute ON public.terminal_ad_uptime_runs (minute DESC);
GRANT SELECT ON public.terminal_ad_uptime_runs TO authenticated;
GRANT ALL ON public.terminal_ad_uptime_runs TO service_role;
ALTER TABLE public.terminal_ad_uptime_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ad uptime runs readable by staff"
  ON public.terminal_ad_uptime_runs FOR SELECT TO authenticated USING (true);

-- 4. Shift summary ------------------------------------------------------------
CREATE TABLE public.terminal_ad_uptime_shift_summary (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ist_date date NOT NULL,
  shift_key text NOT NULL,
  ad_class text NOT NULL,
  exchange_account_id uuid NOT NULL,
  shift_minutes integer NOT NULL DEFAULT 0,
  measured_minutes integer NOT NULL DEFAULT 0,
  unmeasured_minutes integer NOT NULL DEFAULT 0,
  effective_minutes integer NOT NULL DEFAULT 0,
  hollow_minutes integer NOT NULL DEFAULT 0,
  offline_minutes integer NOT NULL DEFAULT 0,
  full_coverage_minutes integer NOT NULL DEFAULT 0,
  partial_coverage_minutes integer NOT NULL DEFAULT 0,
  down_minutes integer NOT NULL DEFAULT 0,
  expected_ads integer NOT NULL DEFAULT 0,
  uptime_pct numeric NOT NULL DEFAULT 0,
  downtime_episodes jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT terminal_ad_uptime_shift_summary_unique UNIQUE (ist_date, shift_key, ad_class, exchange_account_id)
);

CREATE INDEX idx_ad_uptime_summary_date ON public.terminal_ad_uptime_shift_summary (ist_date DESC);
GRANT SELECT ON public.terminal_ad_uptime_shift_summary TO authenticated;
GRANT ALL ON public.terminal_ad_uptime_shift_summary TO service_role;
ALTER TABLE public.terminal_ad_uptime_shift_summary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ad uptime summary readable by staff"
  ON public.terminal_ad_uptime_shift_summary FOR SELECT TO authenticated USING (true);

-- 5. Shift resolution ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.terminal_shift_key_for(p_ts timestamptz)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT w.shift_key
  FROM public.terminal_shift_windows w
  WHERE w.is_active
    AND (
      (w.start_time < w.end_time
        AND (p_ts AT TIME ZONE 'Asia/Kolkata')::time >= w.start_time
        AND (p_ts AT TIME ZONE 'Asia/Kolkata')::time < w.end_time)
      OR
      (w.start_time >= w.end_time
        AND ((p_ts AT TIME ZONE 'Asia/Kolkata')::time >= w.start_time
          OR (p_ts AT TIME ZONE 'Asia/Kolkata')::time < w.end_time))
    )
  ORDER BY w.sort_order
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.terminal_ad_uptime_set_shift()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.ist_date := (NEW.minute AT TIME ZONE 'Asia/Kolkata')::date;
  IF NEW.shift_key IS NULL THEN
    NEW.shift_key := public.terminal_shift_key_for(NEW.minute);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ad_uptime_minutes_shift
  BEFORE INSERT OR UPDATE ON public.terminal_ad_uptime_minutes
  FOR EACH ROW EXECUTE FUNCTION public.terminal_ad_uptime_set_shift();

CREATE TRIGGER trg_shift_windows_updated_at
  BEFORE UPDATE ON public.terminal_shift_windows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_ad_uptime_summary_updated_at
  BEFORE UPDATE ON public.terminal_ad_uptime_shift_summary
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Rollup -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rollup_terminal_ad_uptime(p_date date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
      count(*) FILTER (WHERE m.grade = 'effective') AS ads_effective,
      count(*) FILTER (WHERE m.grade = 'hollow') AS ads_hollow,
      count(*) FILTER (WHERE m.grade = 'offline') AS ads_offline
    FROM public.terminal_ad_uptime_minutes m
    WHERE m.ist_date = p_date AND m.shift_key IS NOT NULL
    GROUP BY 1,2,3,4
  ),
  expected AS (
    SELECT exchange_account_id, ad_class, shift_key, max(ads_total) AS expected_ads
    FROM minute_grid GROUP BY 1,2,3
  ),
  agg AS (
    SELECT
      g.exchange_account_id,
      g.ad_class,
      g.shift_key,
      count(*) AS measured_minutes,
      count(*) FILTER (WHERE g.ads_effective > 0 AND g.ads_effective >= e.expected_ads) AS full_coverage_minutes,
      count(*) FILTER (WHERE g.ads_effective > 0 AND g.ads_effective < e.expected_ads) AS partial_coverage_minutes,
      count(*) FILTER (WHERE g.ads_effective = 0) AS down_minutes,
      sum(g.ads_effective) AS ad_effective_minutes,
      sum(g.ads_hollow) AS ad_hollow_minutes,
      sum(g.ads_offline) AS ad_offline_minutes,
      e.expected_ads
    FROM minute_grid g
    JOIN expected e USING (exchange_account_id, ad_class, shift_key)
    GROUP BY 1,2,3, e.expected_ads
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
          'reasons', to_jsonb(COALESCE((array_agg(DISTINCT r) FILTER (WHERE r IS NOT NULL)), '{}'::text[]))
        ) AS episode
      FROM (
        SELECT
          x.exchange_account_id, x.ad_class, x.shift_key, x.adv_no, x.grade, x.minute, x.hollow_reasons,
          sum(CASE WHEN x.grade = 'effective' THEN 1 ELSE 0 END)
            OVER (PARTITION BY x.exchange_account_id, x.adv_no ORDER BY x.minute) AS grp
        FROM public.terminal_ad_uptime_minutes x
        WHERE x.ist_date = p_date AND x.shift_key IS NOT NULL AND x.grade <> 'effective'
      ) s
      LEFT JOIN LATERAL unnest(COALESCE(s.hollow_reasons, '{}'::text[])) AS r ON true
      GROUP BY s.exchange_account_id, s.ad_class, s.shift_key, s.adv_no, s.grade, s.grp
      HAVING count(*) >= 2
    ) eps
    GROUP BY 1,2,3
  )
  INSERT INTO public.terminal_ad_uptime_shift_summary AS t (
    ist_date, shift_key, ad_class, exchange_account_id,
    shift_minutes, measured_minutes, unmeasured_minutes,
    effective_minutes, hollow_minutes, offline_minutes,
    full_coverage_minutes, partial_coverage_minutes, down_minutes,
    expected_ads, uptime_pct, downtime_episodes
  )
  SELECT
    p_date,
    a.shift_key,
    a.ad_class,
    a.exchange_account_id,
    COALESCE(w.window_minutes, a.measured_minutes),
    a.measured_minutes,
    GREATEST(COALESCE(w.window_minutes, a.measured_minutes) - a.measured_minutes, 0),
    a.ad_effective_minutes,
    a.ad_hollow_minutes,
    a.ad_offline_minutes,
    a.full_coverage_minutes,
    a.partial_coverage_minutes,
    a.down_minutes,
    a.expected_ads,
    CASE WHEN a.measured_minutes > 0
      THEN ROUND(100.0 * (a.full_coverage_minutes + a.partial_coverage_minutes * 0.5) / a.measured_minutes, 2)
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
    full_coverage_minutes = EXCLUDED.full_coverage_minutes,
    partial_coverage_minutes = EXCLUDED.partial_coverage_minutes,
    down_minutes = EXCLUDED.down_minutes,
    expected_ads = EXCLUDED.expected_ads,
    uptime_pct = EXCLUDED.uptime_pct,
    downtime_episodes = EXCLUDED.downtime_episodes,
    updated_at = now();

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.rollup_terminal_ad_uptime(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rollup_terminal_ad_uptime(date) TO service_role;