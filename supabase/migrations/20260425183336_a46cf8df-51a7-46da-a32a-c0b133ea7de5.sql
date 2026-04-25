CREATE TABLE IF NOT EXISTS public.binance_ad_state_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adv_no text NOT NULL,
  rule_id uuid NULL REFERENCES public.ad_pricing_rules(id) ON DELETE SET NULL,
  snapshot_source text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  asset text NULL,
  trade_type text NULL,
  price_type integer NULL,
  adv_status integer NULL,
  price numeric NULL,
  price_floating_ratio numeric NULL,
  init_amount numeric NULL,
  surplus_amount numeric NULL,
  min_single_trans_amount numeric NULL,
  max_single_trans_amount numeric NULL,
  adv_visible_ret jsonb NULL,
  raw_payload jsonb NULL
);

ALTER TABLE public.binance_ad_state_snapshots ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'binance_ad_state_snapshots'
      AND policyname = 'Authenticated users can view Binance ad state snapshots'
  ) THEN
    CREATE POLICY "Authenticated users can view Binance ad state snapshots"
    ON public.binance_ad_state_snapshots
    FOR SELECT
    TO authenticated
    USING (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_binance_ad_state_snapshots_adv_no_captured
  ON public.binance_ad_state_snapshots (adv_no, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_binance_ad_state_snapshots_rule_captured
  ON public.binance_ad_state_snapshots (rule_id, captured_at DESC)
  WHERE rule_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_binance_ad_state_snapshots_captured
  ON public.binance_ad_state_snapshots (captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_binance_ad_state_snapshots_source_captured
  ON public.binance_ad_state_snapshots (snapshot_source, captured_at DESC);

CREATE OR REPLACE VIEW public.v_binance_ad_surplus_movement AS
WITH ordered AS (
  SELECT
    s.*,
    lag(s.surplus_amount) OVER (PARTITION BY s.adv_no ORDER BY s.captured_at) AS previous_surplus_amount,
    lag(s.captured_at) OVER (PARTITION BY s.adv_no ORDER BY s.captured_at) AS previous_captured_at,
    lag(s.price) OVER (PARTITION BY s.adv_no ORDER BY s.captured_at) AS previous_price,
    lag(s.price_floating_ratio) OVER (PARTITION BY s.adv_no ORDER BY s.captured_at) AS previous_price_floating_ratio
  FROM public.binance_ad_state_snapshots s
)
SELECT
  ordered.id,
  ordered.adv_no,
  ordered.rule_id,
  ordered.snapshot_source,
  ordered.captured_at,
  ordered.asset,
  ordered.trade_type,
  ordered.price_type,
  ordered.adv_status,
  ordered.price,
  ordered.price_floating_ratio,
  ordered.init_amount,
  ordered.surplus_amount,
  ordered.previous_surplus_amount,
  CASE
    WHEN ordered.surplus_amount IS NULL OR ordered.previous_surplus_amount IS NULL THEN NULL
    ELSE ordered.previous_surplus_amount - ordered.surplus_amount
  END AS surplus_delta,
  ordered.previous_captured_at,
  CASE
    WHEN ordered.surplus_amount IS NULL OR ordered.previous_surplus_amount IS NULL OR ordered.previous_captured_at IS NULL THEN NULL
    WHEN extract(epoch FROM (ordered.captured_at - ordered.previous_captured_at)) <= 0 THEN NULL
    ELSE (ordered.previous_surplus_amount - ordered.surplus_amount) / (extract(epoch FROM (ordered.captured_at - ordered.previous_captured_at)) / 3600.0)
  END AS drain_rate_per_hour,
  CASE
    WHEN ordered.surplus_amount IS NULL THEN 'No Binance surplus returned'
    WHEN ordered.previous_surplus_amount IS NULL THEN 'First snapshot'
    WHEN ordered.adv_status IS NOT NULL AND ordered.adv_status <> 1 THEN 'Offline/private context'
    WHEN ordered.surplus_amount = ordered.previous_surplus_amount THEN 'Stagnant'
    WHEN ordered.previous_surplus_amount > ordered.surplus_amount THEN 'Draining'
    WHEN ordered.previous_surplus_amount < ordered.surplus_amount THEN 'Replenished'
    ELSE 'Unknown'
  END AS movement_status,
  ordered.previous_price,
  ordered.previous_price_floating_ratio
FROM ordered;

CREATE OR REPLACE FUNCTION public.cleanup_binance_ad_state_snapshots(p_retention_days integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer := 0;
BEGIN
  DELETE FROM public.binance_ad_state_snapshots
  WHERE captured_at < now() - make_interval(days => greatest(p_retention_days, 1));

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_latest_binance_ad_state(p_adv_no text)
RETURNS TABLE (
  adv_no text,
  rule_id uuid,
  snapshot_source text,
  captured_at timestamptz,
  asset text,
  trade_type text,
  price_type integer,
  adv_status integer,
  price numeric,
  price_floating_ratio numeric,
  init_amount numeric,
  surplus_amount numeric,
  movement_status text,
  drain_rate_per_hour numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.adv_no,
    m.rule_id,
    m.snapshot_source,
    m.captured_at,
    m.asset,
    m.trade_type,
    m.price_type,
    m.adv_status,
    m.price,
    m.price_floating_ratio,
    m.init_amount,
    m.surplus_amount,
    m.movement_status,
    m.drain_rate_per_hour
  FROM public.v_binance_ad_surplus_movement m
  WHERE m.adv_no = p_adv_no
  ORDER BY m.captured_at DESC
  LIMIT 1;
$$;