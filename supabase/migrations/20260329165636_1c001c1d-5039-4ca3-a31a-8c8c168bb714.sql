
-- ============================================================
-- TERMINAL AUDIT V2 — ALL FIXES (Phase 0 + Phase 1 + Phase 2)
-- ============================================================

-- PHASE 0: T2-CRASH-01
ALTER TABLE terminal_notifications
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';

-- PHASE 0: T2-CRASH-03
ALTER TABLE terminal_auto_assignment_log
  ALTER COLUMN assigned_to DROP NOT NULL;

-- PHASE 0: T2-CRASH-04
DROP INDEX IF EXISTS idx_payer_order_locks_unique_active;
CREATE UNIQUE INDEX idx_payer_order_locks_unique_locked
  ON terminal_payer_order_locks (order_number)
  WHERE (status = 'locked');

-- MPI schema columns
ALTER TABLE terminal_mpi_snapshots
  ADD COLUMN IF NOT EXISTS completion_rate numeric DEFAULT 0;
ALTER TABLE terminal_mpi_snapshots
  ADD COLUMN IF NOT EXISTS avg_response_time_minutes numeric DEFAULT 0;
ALTER TABLE terminal_mpi_snapshots
  ADD COLUMN IF NOT EXISTS avg_order_size numeric DEFAULT 0;
ALTER TABLE terminal_mpi_snapshots
  ADD COLUMN IF NOT EXISTS mpi_score numeric DEFAULT 0;

ALTER TABLE terminal_order_assignments
  ADD COLUMN IF NOT EXISTS first_action_at timestamptz;

-- T2-CRASH-02: user_id text → uuid
ALTER TABLE terminal_mpi_snapshots
  DROP CONSTRAINT IF EXISTS terminal_mpi_snapshots_user_id_snapshot_date_key;
ALTER TABLE terminal_mpi_snapshots
  ALTER COLUMN user_id TYPE uuid USING user_id::uuid;
ALTER TABLE terminal_mpi_snapshots
  ADD CONSTRAINT terminal_mpi_snapshots_user_id_snapshot_date_key UNIQUE (user_id, snapshot_date);

-- Drop all overloads of generate_terminal_mpi_snapshots before recreating
DROP FUNCTION IF EXISTS generate_terminal_mpi_snapshots(date);

CREATE FUNCTION generate_terminal_mpi_snapshots(p_date date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
  v_count integer := 0;
  v_orders_handled integer;
  v_orders_completed integer;
  v_orders_cancelled integer;
  v_total_volume numeric;
  v_avg_time numeric;
  v_buy_count integer;
  v_sell_count integer;
  v_completion_rate numeric;
  v_avg_response numeric;
  v_avg_size numeric;
  v_mpi numeric;
BEGIN
  FOR v_user IN
    SELECT user_id FROM terminal_user_profiles WHERE is_active = true
  LOOP
    SELECT COUNT(*) INTO v_orders_handled
    FROM terminal_order_assignments
    WHERE assigned_to = v_user.user_id
      AND created_at::date = p_date;

    SELECT
      COUNT(*) FILTER (WHERE por.order_status = 'COMPLETED'),
      COUNT(*) FILTER (WHERE por.order_status IN ('CANCELLED', 'CANCELLED_BY_SYSTEM')),
      COALESCE(SUM(CASE WHEN por.order_status = 'COMPLETED' THEN por.total_price::numeric ELSE 0 END), 0),
      COUNT(*) FILTER (WHERE por.trade_type = 'BUY'),
      COUNT(*) FILTER (WHERE por.trade_type = 'SELL'),
      COALESCE(AVG(CASE
        WHEN por.order_status = 'COMPLETED' AND por.completed_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (por.completed_at - por.created_at)) / 60.0
        ELSE NULL
      END), 0),
      COALESCE(AVG(CASE
        WHEN toa.first_action_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (toa.first_action_at - toa.created_at)) / 60.0
        ELSE NULL
      END), 0),
      COALESCE(AVG(CASE WHEN por.order_status = 'COMPLETED' THEN por.total_price::numeric ELSE NULL END), 0)
    INTO v_orders_completed, v_orders_cancelled, v_total_volume, v_buy_count, v_sell_count, v_avg_time, v_avg_response, v_avg_size
    FROM terminal_order_assignments toa
    LEFT JOIN p2p_order_records por ON por.binance_order_number = toa.order_number
    WHERE toa.assigned_to = v_user.user_id
      AND toa.created_at::date = p_date;

    IF v_orders_handled > 0 THEN
      v_completion_rate := round((v_orders_completed::numeric / v_orders_handled::numeric) * 100, 2);
    ELSE
      v_completion_rate := 0;
    END IF;

    v_mpi := round(
      (v_completion_rate * 0.4) +
      (GREATEST(0, (1 - LEAST(v_avg_time, 60) / 60.0)) * 100 * 0.3) +
      (LEAST(v_orders_handled, 50) / 50.0 * 100 * 0.3)
    , 2);

    INSERT INTO terminal_mpi_snapshots (
      user_id, snapshot_date, orders_handled, orders_completed, orders_cancelled,
      total_volume, avg_completion_time_minutes, buy_count, sell_count, idle_time_minutes,
      completion_rate, avg_response_time_minutes, avg_order_size, mpi_score
    ) VALUES (
      v_user.user_id, p_date, v_orders_handled, v_orders_completed, v_orders_cancelled,
      v_total_volume, round(v_avg_time::numeric, 2), v_buy_count, v_sell_count, 0,
      v_completion_rate, round(v_avg_response::numeric, 2), round(v_avg_size::numeric, 2), v_mpi
    )
    ON CONFLICT (user_id, snapshot_date) DO UPDATE SET
      orders_handled = EXCLUDED.orders_handled,
      orders_completed = EXCLUDED.orders_completed,
      orders_cancelled = EXCLUDED.orders_cancelled,
      total_volume = EXCLUDED.total_volume,
      avg_completion_time_minutes = EXCLUDED.avg_completion_time_minutes,
      buy_count = EXCLUDED.buy_count,
      sell_count = EXCLUDED.sell_count,
      idle_time_minutes = EXCLUDED.idle_time_minutes,
      completion_rate = EXCLUDED.completion_rate,
      avg_response_time_minutes = EXCLUDED.avg_response_time_minutes,
      avg_order_size = EXCLUDED.avg_order_size,
      mpi_score = EXCLUDED.mpi_score;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- PHASE 1: Drop BOTH overloads of auto_assign_order_by_scope
DROP FUNCTION IF EXISTS auto_assign_order_by_scope(text, text, numeric, text, text);
DROP FUNCTION IF EXISTS auto_assign_order_by_scope(text, text, text, numeric, text);

CREATE FUNCTION auto_assign_order_by_scope(
  p_order_number text,
  p_adv_no text DEFAULT NULL,
  p_trade_type text DEFAULT NULL,
  p_total_price numeric DEFAULT NULL,
  p_asset text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_matched_operator_id uuid;
  v_match_type text;
  v_assignment_id uuid;
  v_max_orders integer;
  v_eligible_count integer;
  v_reason text;
  v_is_enabled boolean;
BEGIN
  SELECT is_enabled INTO v_is_enabled
  FROM terminal_auto_assignment_config LIMIT 1;

  IF NOT COALESCE(v_is_enabled, false) THEN
    RETURN jsonb_build_object('status', 'disabled', 'reason', 'Auto-assignment is disabled');
  END IF;

  IF EXISTS (
    SELECT 1 FROM terminal_order_assignments
    WHERE order_number = p_order_number AND is_active = true
  ) THEN
    RETURN jsonb_build_object('status', 'already_assigned');
  END IF;

  SELECT max_orders_per_operator INTO v_max_orders
  FROM terminal_auto_assignment_config LIMIT 1;
  v_max_orders := COALESCE(v_max_orders, 50);

  -- Priority 1: Ad ID match
  IF p_adv_no IS NOT NULL THEN
    SELECT oa.operator_user_id, COUNT(*) OVER() INTO v_matched_operator_id, v_eligible_count
    FROM terminal_operator_assignments oa
    JOIN terminal_user_profiles tup ON tup.user_id = oa.operator_user_id AND tup.is_active = true
    JOIN terminal_user_presence tpr ON tpr.user_id = oa.operator_user_id
      AND tpr.is_online = true
      AND tpr.last_seen_at > now() - interval '90 seconds'
      AND tpr.status = 'active'
    LEFT JOIN (
      SELECT assigned_to, COUNT(*) as cnt
      FROM terminal_order_assignments WHERE is_active = true GROUP BY assigned_to
    ) workload ON workload.assigned_to = oa.operator_user_id
    WHERE oa.assignment_type = 'ad_id'
      AND oa.ad_id = p_adv_no
      AND oa.is_active = true
      AND COALESCE(workload.cnt, 0) < v_max_orders
    ORDER BY COALESCE(workload.cnt, 0) ASC
    LIMIT 1;

    IF v_matched_operator_id IS NOT NULL THEN
      v_match_type := 'ad_id';
    END IF;
  END IF;

  -- Priority 2: Size range via operator_assignments
  IF v_matched_operator_id IS NULL THEN
    SELECT oa.operator_user_id, COUNT(*) OVER() INTO v_matched_operator_id, v_eligible_count
    FROM terminal_operator_assignments oa
    JOIN terminal_order_size_ranges osr ON osr.id = oa.size_range_id AND osr.is_active = true
    JOIN terminal_user_profiles tup ON tup.user_id = oa.operator_user_id AND tup.is_active = true
    JOIN terminal_user_presence tpr ON tpr.user_id = oa.operator_user_id
      AND tpr.is_online = true
      AND tpr.last_seen_at > now() - interval '90 seconds'
      AND tpr.status = 'active'
    LEFT JOIN (
      SELECT assigned_to, COUNT(*) as cnt
      FROM terminal_order_assignments WHERE is_active = true GROUP BY assigned_to
    ) workload ON workload.assigned_to = oa.operator_user_id
    WHERE oa.assignment_type = 'size_range'
      AND oa.is_active = true
      AND p_total_price >= osr.min_amount
      AND (osr.max_amount IS NULL OR p_total_price <= osr.max_amount)
      AND (osr.order_type IS NULL OR osr.order_type = p_trade_type)
      AND COALESCE(workload.cnt, 0) < v_max_orders
    ORDER BY COALESCE(workload.cnt, 0) ASC
    LIMIT 1;

    IF v_matched_operator_id IS NOT NULL THEN
      v_match_type := 'size_range';
    END IF;
  END IF;

  -- Priority 3: Fallback to terminal_user_size_range_mappings
  IF v_matched_operator_id IS NULL AND p_total_price IS NOT NULL THEN
    SELECT usrm.user_id, COUNT(*) OVER() INTO v_matched_operator_id, v_eligible_count
    FROM terminal_user_size_range_mappings usrm
    JOIN terminal_order_size_ranges osr ON osr.id = usrm.size_range_id AND osr.is_active = true
    JOIN terminal_user_profiles tup ON tup.user_id = usrm.user_id AND tup.is_active = true
    JOIN terminal_user_presence tpr ON tpr.user_id = usrm.user_id
      AND tpr.is_online = true
      AND tpr.last_seen_at > now() - interval '90 seconds'
      AND tpr.status = 'active'
    LEFT JOIN (
      SELECT assigned_to, COUNT(*) as cnt
      FROM terminal_order_assignments WHERE is_active = true GROUP BY assigned_to
    ) workload ON workload.assigned_to = usrm.user_id
    WHERE p_total_price >= osr.min_amount
      AND (osr.max_amount IS NULL OR p_total_price <= osr.max_amount)
      AND (osr.order_type IS NULL OR osr.order_type = p_trade_type)
      AND COALESCE(workload.cnt, 0) < v_max_orders
    ORDER BY COALESCE(workload.cnt, 0) ASC
    LIMIT 1;

    IF v_matched_operator_id IS NOT NULL THEN
      v_match_type := 'size_range_fallback';
    END IF;
  END IF;

  IF v_matched_operator_id IS NULL THEN
    v_reason := 'No online operator matched (ad_id=' || COALESCE(p_adv_no, 'null') || ', price=' || COALESCE(p_total_price::text, 'null') || ')';
    INSERT INTO terminal_auto_assignment_log (order_number, assigned_to, strategy_used, eligible_count, reason)
    VALUES (p_order_number, NULL, 'no_match', COALESCE(v_eligible_count, 0), v_reason);
    RETURN jsonb_build_object('status', 'no_match', 'reason', v_reason);
  END IF;

  v_assignment_id := assign_terminal_order(
    p_order_number := p_order_number,
    p_assigned_to := v_matched_operator_id,
    p_assigned_by := v_matched_operator_id,
    p_assignment_type := 'auto_scope',
    p_trade_type := p_trade_type,
    p_total_price := p_total_price,
    p_asset := p_asset
  );

  v_reason := 'Matched via ' || v_match_type || ' (eligible=' || COALESCE(v_eligible_count, 0) || ')';
  INSERT INTO terminal_auto_assignment_log (order_number, assigned_to, strategy_used, eligible_count, reason)
  VALUES (p_order_number, v_matched_operator_id, v_match_type, COALESCE(v_eligible_count, 0), v_reason);

  RETURN jsonb_build_object(
    'status', 'assigned',
    'operator_id', v_matched_operator_id,
    'match_type', v_match_type,
    'assignment_id', v_assignment_id
  );
END;
$$;

-- T2-BUG-08: set_terminal_user_status RPC
CREATE OR REPLACE FUNCTION set_terminal_user_status(p_user_id uuid, p_status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_status text;
BEGIN
  IF p_status NOT IN ('active', 'on_break', 'busy') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be active, on_break, or busy', p_status;
  END IF;

  SELECT status INTO v_old_status
  FROM terminal_user_presence WHERE user_id = p_user_id;

  IF v_old_status IS NULL THEN
    RAISE EXCEPTION 'User % not found in terminal_user_presence', p_user_id;
  END IF;

  UPDATE terminal_user_presence
  SET status = p_status, updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO terminal_activity_log (user_id, activity_type, metadata)
  VALUES (p_user_id, 'status_change', jsonb_build_object('old_status', v_old_status, 'new_status', p_status));

  RETURN jsonb_build_object('success', true, 'old_status', v_old_status, 'new_status', p_status);
END;
$$;

-- T2-AUTO-01: Rewrite sync_p2p_order with auto-deactivate
CREATE OR REPLACE FUNCTION sync_p2p_order(
  p_order_number text, p_adv_no text, p_nickname text, p_trade_type text,
  p_asset text, p_fiat text, p_amount numeric, p_total_price numeric,
  p_unit_price numeric, p_commission numeric, p_status text,
  p_pay_method text, p_create_time bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_counterparty_id UUID;
  v_is_repeat BOOLEAN := false;
  v_repeat_count INT := 0;
  v_order_id UUID;
  v_existing_status TEXT;
  v_effective_status TEXT;
  v_status_rank_old INT;
  v_status_rank_new INT;
BEGIN
  v_counterparty_id := upsert_p2p_counterparty(p_nickname, p_trade_type, p_total_price);

  SELECT COUNT(*) INTO v_repeat_count
  FROM p2p_order_records
  WHERE counterparty_id = v_counterparty_id
    AND binance_order_number != p_order_number;
  v_is_repeat := v_repeat_count > 0;

  SELECT order_status INTO v_existing_status
  FROM p2p_order_records WHERE binance_order_number = p_order_number;

  v_status_rank_old := CASE
    WHEN v_existing_status IS NULL THEN -1
    WHEN v_existing_status ILIKE '%PENDING%' THEN 0
    WHEN v_existing_status ILIKE '%TRADING%' THEN 1
    WHEN v_existing_status ILIKE '%BUYER_PAY%' OR v_existing_status ILIKE '%BUYER_PAID%' THEN 2
    WHEN v_existing_status ILIKE '%APPEAL%' THEN 3
    WHEN v_existing_status ILIKE '%CANCEL%' THEN 3
    WHEN v_existing_status ILIKE '%EXPIRED%' THEN 3
    WHEN v_existing_status ILIKE '%COMPLETED%' THEN 4
    ELSE 0
  END;

  v_status_rank_new := CASE
    WHEN p_status ILIKE '%PENDING%' THEN 0
    WHEN p_status ILIKE '%TRADING%' THEN 1
    WHEN p_status ILIKE '%BUYER_PAY%' OR p_status ILIKE '%BUYER_PAID%' THEN 2
    WHEN p_status ILIKE '%APPEAL%' THEN 3
    WHEN p_status ILIKE '%CANCEL%' THEN 3
    WHEN p_status ILIKE '%EXPIRED%' THEN 3
    WHEN p_status ILIKE '%COMPLETED%' THEN 4
    ELSE 0
  END;

  IF v_status_rank_new >= v_status_rank_old THEN
    v_effective_status := p_status;
  ELSE
    v_effective_status := v_existing_status;
  END IF;

  INSERT INTO p2p_order_records (
    binance_order_number, binance_adv_no, counterparty_id, counterparty_nickname,
    trade_type, asset, fiat_unit, amount, total_price, unit_price, commission,
    order_status, pay_method_name, binance_create_time,
    is_repeat_client, repeat_order_count
  ) VALUES (
    p_order_number, p_adv_no, v_counterparty_id, p_nickname,
    p_trade_type, p_asset, p_fiat, p_amount, p_total_price, p_unit_price, p_commission,
    v_effective_status, p_pay_method, p_create_time,
    v_is_repeat, v_repeat_count
  )
  ON CONFLICT (binance_order_number) DO UPDATE SET
    order_status = v_effective_status,
    counterparty_id = EXCLUDED.counterparty_id,
    is_repeat_client = v_is_repeat,
    repeat_order_count = v_repeat_count,
    total_price = CASE WHEN EXCLUDED.total_price > 0 THEN EXCLUDED.total_price ELSE p2p_order_records.total_price END,
    amount = CASE WHEN EXCLUDED.amount > 0 THEN EXCLUDED.amount ELSE p2p_order_records.amount END,
    unit_price = CASE WHEN EXCLUDED.unit_price > 0 THEN EXCLUDED.unit_price ELSE p2p_order_records.unit_price END,
    commission = CASE WHEN EXCLUDED.commission > 0 THEN EXCLUDED.commission ELSE p2p_order_records.commission END,
    updated_at = now(),
    completed_at = CASE WHEN v_effective_status ILIKE '%COMPLETED%' AND p2p_order_records.completed_at IS NULL THEN now() ELSE p2p_order_records.completed_at END,
    cancelled_at = CASE WHEN v_effective_status ILIKE '%CANCEL%' AND p2p_order_records.cancelled_at IS NULL THEN now() ELSE p2p_order_records.cancelled_at END
  RETURNING id INTO v_order_id;

  IF v_effective_status ILIKE '%CANCEL%' THEN
    DELETE FROM p2p_order_chats WHERE order_id = v_order_id;
  END IF;

  IF v_effective_status ILIKE '%COMPLETED%' THEN
    UPDATE p2p_chat_media
    SET expires_at = now() + interval '7 days'
    WHERE order_id = v_order_id AND expires_at IS NULL;
  END IF;

  -- T2-AUTO-01: Auto-deactivate assignments + release payer locks
  IF v_effective_status ILIKE '%COMPLETED%' OR v_effective_status ILIKE '%CANCEL%' OR v_effective_status ILIKE '%EXPIRED%' THEN
    UPDATE terminal_order_assignments
    SET is_active = false, updated_at = now()
    WHERE order_number = p_order_number AND is_active = true;

    UPDATE terminal_payer_order_locks
    SET status = 'auto_released', completed_at = now()
    WHERE order_number = p_order_number AND status = 'locked';
  END IF;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'is_repeat', v_is_repeat,
    'repeat_count', v_repeat_count,
    'status', v_effective_status
  );
END;
$$;

-- PHASE 2: MPI Summary RPC
CREATE OR REPLACE FUNCTION get_terminal_mpi_summary(p_user_id uuid, p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'user_id', p_user_id, 'period_from', p_from, 'period_to', p_to,
    'total_days', COUNT(*),
    'total_orders_handled', SUM(orders_handled),
    'total_orders_completed', SUM(orders_completed),
    'total_orders_cancelled', SUM(orders_cancelled),
    'total_volume', SUM(total_volume),
    'avg_completion_time', round(AVG(NULLIF(avg_completion_time_minutes, 0))::numeric, 2),
    'avg_completion_rate', round(AVG(completion_rate)::numeric, 2),
    'avg_response_time', round(AVG(NULLIF(avg_response_time_minutes, 0))::numeric, 2),
    'avg_mpi_score', round(AVG(mpi_score)::numeric, 2),
    'total_buy_count', SUM(buy_count),
    'total_sell_count', SUM(sell_count),
    'avg_order_size', round(AVG(NULLIF(avg_order_size, 0))::numeric, 2)
  ) INTO v_result
  FROM terminal_mpi_snapshots
  WHERE user_id = p_user_id AND snapshot_date >= p_from AND snapshot_date <= p_to;

  RETURN COALESCE(v_result, jsonb_build_object('user_id', p_user_id, 'total_days', 0));
END;
$$;

-- PHASE 2: MPI Leaderboard RPC
CREATE OR REPLACE FUNCTION get_terminal_mpi_leaderboard(p_from date, p_to date, p_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_result jsonb;
BEGIN
  SELECT jsonb_agg(row_data ORDER BY avg_score DESC) INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'user_id', s.user_id,
      'name', COALESCE(tup.display_name, s.user_id::text),
      'total_orders', SUM(s.orders_handled),
      'total_completed', SUM(s.orders_completed),
      'total_volume', SUM(s.total_volume),
      'avg_completion_rate', round(AVG(s.completion_rate)::numeric, 2),
      'avg_completion_time', round(AVG(NULLIF(s.avg_completion_time_minutes, 0))::numeric, 2),
      'avg_response_time', round(AVG(NULLIF(s.avg_response_time_minutes, 0))::numeric, 2),
      'avg_mpi_score', round(AVG(s.mpi_score)::numeric, 2)
    ) as row_data,
    AVG(s.mpi_score) as avg_score
    FROM terminal_mpi_snapshots s
    LEFT JOIN terminal_user_profiles tup ON tup.user_id = s.user_id
    WHERE s.snapshot_date >= p_from AND s.snapshot_date <= p_to
    GROUP BY s.user_id, tup.display_name
    LIMIT p_limit
  ) ranked;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- PHASE 2: Backfill historical MPI data
DO $$
DECLARE
  v_date date;
  v_result integer;
BEGIN
  v_date := '2026-02-14'::date;
  WHILE v_date < CURRENT_DATE LOOP
    v_result := generate_terminal_mpi_snapshots(v_date);
    v_date := v_date + 1;
  END LOOP;
END;
$$;
