
-- =============================================
-- AUTO-PRICING AUDIT: PHASES 0-3 MIGRATION
-- =============================================

-- ========== PHASE 0: CRITICAL FIXES ==========

-- AP-BUG-02: Trim existing dirty merchant data
UPDATE ad_pricing_rules SET target_merchant = TRIM(target_merchant) WHERE target_merchant != TRIM(target_merchant);

-- AP-BUG-02: Auto-trim trigger on INSERT/UPDATE
CREATE OR REPLACE FUNCTION trim_ad_pricing_rule_merchants()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.target_merchant := TRIM(NEW.target_merchant);
  IF NEW.fallback_merchants IS NOT NULL THEN
    NEW.fallback_merchants := (
      SELECT array_agg(TRIM(m))
      FROM unnest(NEW.fallback_merchants) AS m
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trim_pricing_merchants ON ad_pricing_rules;
CREATE TRIGGER trg_trim_pricing_merchants
  BEFORE INSERT OR UPDATE ON ad_pricing_rules
  FOR EACH ROW EXECUTE FUNCTION trim_ad_pricing_rule_merchants();

-- AP-BUG-04: Lower absurd auto_pause_after_deviations values
UPDATE ad_pricing_rules SET auto_pause_after_deviations = 15 WHERE auto_pause_after_deviations > 100;

-- AP-BUG-04: Validation trigger for auto_pause range (1-100)
CREATE OR REPLACE FUNCTION validate_pricing_rule_thresholds()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.auto_pause_after_deviations IS NOT NULL AND
     (NEW.auto_pause_after_deviations < 1 OR NEW.auto_pause_after_deviations > 100) THEN
    RAISE EXCEPTION 'auto_pause_after_deviations must be between 1 and 100, got %', NEW.auto_pause_after_deviations;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_pricing_thresholds ON ad_pricing_rules;
CREATE TRIGGER trg_validate_pricing_thresholds
  BEFORE INSERT OR UPDATE ON ad_pricing_rules
  FOR EACH ROW EXECUTE FUNCTION validate_pricing_rule_thresholds();

-- ========== PHASE 1: SAFETY & RELIABILITY ==========

-- AP-ARCH-01: Circuit breaker singleton table
CREATE TABLE IF NOT EXISTS ad_pricing_engine_state (
  id text PRIMARY KEY DEFAULT 'singleton',
  circuit_status text NOT NULL DEFAULT 'CLOSED',
  consecutive_failures integer NOT NULL DEFAULT 0,
  failure_threshold integer NOT NULL DEFAULT 5,
  cooldown_minutes integer NOT NULL DEFAULT 10,
  last_failure_at timestamptz,
  last_success_at timestamptz,
  opened_at timestamptz,
  updated_at timestamptz DEFAULT now()
);

-- Singleton enforcement trigger
CREATE OR REPLACE FUNCTION enforce_pricing_engine_state_singleton()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (SELECT count(*) FROM ad_pricing_engine_state) > 0 AND NEW.id != 'singleton' THEN
    RAISE EXCEPTION 'ad_pricing_engine_state is a singleton table';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pricing_engine_state_singleton ON ad_pricing_engine_state;
CREATE TRIGGER trg_pricing_engine_state_singleton
  BEFORE INSERT ON ad_pricing_engine_state
  FOR EACH ROW EXECUTE FUNCTION enforce_pricing_engine_state_singleton();

-- Insert singleton row
INSERT INTO ad_pricing_engine_state (id) VALUES ('singleton') ON CONFLICT (id) DO NOTHING;

ALTER TABLE ad_pricing_engine_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated read" ON ad_pricing_engine_state FOR SELECT TO authenticated USING (true);

-- AP-MISS-04: Cooldown enforcement trigger
CREATE OR REPLACE FUNCTION enforce_pricing_cooldown()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only enforce when price/ratio is being changed by the engine (not manual edits)
  IF (NEW.last_applied_price IS DISTINCT FROM OLD.last_applied_price OR
      NEW.last_applied_ratio IS DISTINCT FROM OLD.last_applied_ratio) THEN
    IF OLD.manual_override_cooldown_minutes > 0 AND OLD.last_manual_edit_at IS NOT NULL THEN
      IF now() < OLD.last_manual_edit_at + (OLD.manual_override_cooldown_minutes || ' minutes')::interval THEN
        RAISE EXCEPTION 'Manual override cooldown active until %',
          OLD.last_manual_edit_at + (OLD.manual_override_cooldown_minutes || ' minutes')::interval;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_pricing_cooldown ON ad_pricing_rules;
CREATE TRIGGER trg_enforce_pricing_cooldown
  BEFORE UPDATE ON ad_pricing_rules
  FOR EACH ROW EXECUTE FUNCTION enforce_pricing_cooldown();

-- AP-BUG-03: Column comments for field hierarchy clarity
COMMENT ON COLUMN ad_pricing_rules.offset_amount IS 'Top-level default offset amount (₹). Overridden by asset_config[asset].offset_amount if set.';
COMMENT ON COLUMN ad_pricing_rules.offset_pct IS 'Top-level default offset percentage. Overridden by asset_config[asset].offset_pct if set.';
COMMENT ON COLUMN ad_pricing_rules.max_ceiling IS 'Top-level default max price ceiling (₹). Overridden by asset_config[asset].max_ceiling if set.';
COMMENT ON COLUMN ad_pricing_rules.min_floor IS 'Top-level default min price floor (₹). Overridden by asset_config[asset].min_floor if set.';
COMMENT ON COLUMN ad_pricing_rules.max_ratio_ceiling IS 'Top-level default max ratio ceiling. Overridden by asset_config[asset].max_ratio_ceiling if set.';
COMMENT ON COLUMN ad_pricing_rules.min_ratio_floor IS 'Top-level default min ratio floor. Overridden by asset_config[asset].min_ratio_floor if set.';
COMMENT ON COLUMN ad_pricing_rules.ad_numbers IS 'Top-level ad numbers (backward compat). Per-asset ad numbers are in asset_config[asset].ad_numbers.';
COMMENT ON COLUMN ad_pricing_rules.asset_config IS 'Per-asset configuration overrides. Keys are asset codes (e.g. USDT, BTC). Values override top-level offset/cap fields. Fallback chain: asset_config[asset].field ?? top-level field ?? default.';

-- ========== PHASE 2: OPERATIONAL COMPLETENESS ==========

-- AP-MISS-02: Health dashboard RPC
CREATE OR REPLACE FUNCTION get_ad_pricing_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_rules_detail jsonb;
  v_rest_timer jsonb;
  v_circuit jsonb;
  v_log_stats jsonb;
BEGIN
  -- Rules summary
  SELECT jsonb_build_object(
    'total_rules', count(*),
    'active_rules', count(*) FILTER (WHERE is_active),
    'paused_rules', count(*) FILTER (WHERE NOT is_active),
    'rules_with_errors', count(*) FILTER (WHERE consecutive_errors > 0),
    'rules_with_deviations', count(*) FILTER (WHERE consecutive_deviations > 0)
  ) INTO v_result FROM ad_pricing_rules;

  -- Per-rule detail
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'is_active', is_active,
    'assets', coalesce(assets, ARRAY[asset]),
    'trade_type', trade_type, 'price_type', price_type,
    'target_merchant', target_merchant,
    'consecutive_errors', consecutive_errors,
    'consecutive_deviations', consecutive_deviations,
    'last_checked_at', last_checked_at,
    'last_error', last_error,
    'last_applied_price', last_applied_price,
    'last_applied_ratio', last_applied_ratio
  ) ORDER BY created_at DESC), '[]'::jsonb) INTO v_rules_detail FROM ad_pricing_rules;

  -- Rest timer status
  SELECT coalesce(jsonb_build_object(
    'is_active', r.is_active,
    'started_at', r.started_at,
    'duration_minutes', r.duration_minutes,
    'expires_at', r.started_at + (r.duration_minutes || ' minutes')::interval
  ), '{"is_active": false}'::jsonb) INTO v_rest_timer
  FROM ad_rest_timer r WHERE r.is_active = true LIMIT 1;

  IF v_rest_timer IS NULL THEN v_rest_timer := '{"is_active": false}'::jsonb; END IF;

  -- Circuit breaker status
  SELECT jsonb_build_object(
    'circuit_status', circuit_status,
    'consecutive_failures', consecutive_failures,
    'failure_threshold', failure_threshold,
    'last_failure_at', last_failure_at,
    'last_success_at', last_success_at
  ) INTO v_circuit FROM ad_pricing_engine_state WHERE id = 'singleton';

  -- Log stats (last 24h)
  SELECT jsonb_build_object(
    'total_24h', count(*),
    'applied_24h', count(*) FILTER (WHERE status = 'applied'),
    'skipped_24h', count(*) FILTER (WHERE status = 'skipped'),
    'errors_24h', count(*) FILTER (WHERE status = 'error'),
    'dry_runs_24h', count(*) FILTER (WHERE status = 'dry_run')
  ) INTO v_log_stats FROM ad_pricing_logs WHERE created_at > now() - interval '24 hours';

  RETURN v_result || jsonb_build_object(
    'rules', v_rules_detail,
    'rest_timer', v_rest_timer,
    'circuit_breaker', v_circuit,
    'log_stats', v_log_stats
  );
END;
$$;

-- AP-MISS-05: Extend cleanup function with ad_pricing_logs + ad_action_logs retention
CREATE OR REPLACE FUNCTION cleanup_terminal_stale_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE terminal_biometric_sessions SET is_active = false
  WHERE is_active = true AND expires_at < now();

  UPDATE terminal_user_presence SET is_online = false, updated_at = now()
  WHERE is_online = true AND last_seen_at < now() - interval '90 seconds';

  DELETE FROM terminal_webauthn_challenges WHERE expires_at < now();

  DELETE FROM terminal_bypass_codes WHERE is_used = false AND expires_at < now();

  DELETE FROM terminal_notifications
  WHERE is_active = false AND created_at < now() - interval '30 days';

  DELETE FROM terminal_biometric_sessions
  WHERE is_active = false AND expires_at < now() - interval '7 days';

  -- Deactivate expired broadcasts
  UPDATE terminal_broadcasts SET is_active = false
  WHERE is_active = true AND expires_at IS NOT NULL AND expires_at < now();

  -- AP-MISS-05: Auto-pricing log retention (30 days)
  DELETE FROM ad_pricing_logs WHERE created_at < now() - interval '30 days';

  -- AP-MISS-05: Action log retention (90 days)
  DELETE FROM ad_action_logs WHERE created_at < now() - interval '90 days';
END;
$$;

-- ========== PHASE 3: ANALYTICS & POLISH ==========

-- AP-MISS-07: Price effectiveness snapshots table
CREATE TABLE IF NOT EXISTS ad_pricing_effectiveness_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid REFERENCES ad_pricing_rules(id) ON DELETE CASCADE NOT NULL,
  snapshot_date date NOT NULL,
  total_price_updates integer NOT NULL DEFAULT 0,
  avg_applied_price numeric,
  avg_competitor_price numeric,
  avg_spread numeric,
  orders_received integer NOT NULL DEFAULT 0,
  orders_completed integer NOT NULL DEFAULT 0,
  total_volume numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(rule_id, snapshot_date)
);

ALTER TABLE ad_pricing_effectiveness_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated read" ON ad_pricing_effectiveness_snapshots FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_pricing_effectiveness_rule_date ON ad_pricing_effectiveness_snapshots(rule_id, snapshot_date DESC);

-- AP-MISS-07: Snapshot generation function
CREATE OR REPLACE FUNCTION generate_pricing_effectiveness_snapshot(p_date date DEFAULT CURRENT_DATE - 1)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  INSERT INTO ad_pricing_effectiveness_snapshots (
    rule_id, snapshot_date, total_price_updates,
    avg_applied_price, avg_competitor_price, avg_spread,
    orders_received, orders_completed, total_volume
  )
  SELECT
    l.rule_id,
    p_date,
    count(*) FILTER (WHERE l.status = 'applied'),
    avg(l.applied_price) FILTER (WHERE l.applied_price IS NOT NULL),
    avg(l.competitor_price) FILTER (WHERE l.competitor_price IS NOT NULL),
    avg(l.applied_price - l.competitor_price) FILTER (WHERE l.applied_price IS NOT NULL AND l.competitor_price IS NOT NULL),
    -- Orders: match by ad_number and date from binance_order_history
    coalesce((
      SELECT count(DISTINCT o.order_number)
      FROM binance_order_history o
      WHERE o.adv_no = ANY(r.ad_numbers)
        AND to_timestamp(o.create_time / 1000)::date = p_date
    ), 0),
    coalesce((
      SELECT count(DISTINCT o.order_number)
      FROM binance_order_history o
      WHERE o.adv_no = ANY(r.ad_numbers)
        AND to_timestamp(o.create_time / 1000)::date = p_date
        AND o.order_status IN ('COMPLETED', '4')
    ), 0),
    coalesce((
      SELECT sum(o.total_price::numeric)
      FROM binance_order_history o
      WHERE o.adv_no = ANY(r.ad_numbers)
        AND to_timestamp(o.create_time / 1000)::date = p_date
        AND o.order_status IN ('COMPLETED', '4')
    ), 0)
  FROM ad_pricing_logs l
  JOIN ad_pricing_rules r ON r.id = l.rule_id
  WHERE l.created_at::date = p_date
  GROUP BY l.rule_id, r.ad_numbers
  ON CONFLICT (rule_id, snapshot_date) DO UPDATE SET
    total_price_updates = EXCLUDED.total_price_updates,
    avg_applied_price = EXCLUDED.avg_applied_price,
    avg_competitor_price = EXCLUDED.avg_competitor_price,
    avg_spread = EXCLUDED.avg_spread,
    orders_received = EXCLUDED.orders_received,
    orders_completed = EXCLUDED.orders_completed,
    total_volume = EXCLUDED.total_volume;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- AP-ARCH-03: Dry-run mode column
ALTER TABLE ad_pricing_rules ADD COLUMN IF NOT EXISTS is_dry_run boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN ad_pricing_rules.is_dry_run IS 'When true, engine calculates prices and logs results but skips Binance API calls. Use for testing rules before going live.';
