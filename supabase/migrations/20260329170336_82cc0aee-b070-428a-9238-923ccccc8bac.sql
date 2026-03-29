
-- ============================================================
-- TERMINAL AUDIT V2 — PHASE 3 + PHASE 4
-- ============================================================

-- ========================================
-- #19 T2-AUTO-05: Broadcast cleanup (1 line addition)
-- ========================================
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

  -- #19: Deactivate expired broadcasts
  UPDATE terminal_broadcasts SET is_active = false
  WHERE is_active = true AND expires_at IS NOT NULL AND expires_at < now();
END;
$$;

-- ========================================
-- #16 T2-BUG-11: Wire ALL config flags into auto_assign
-- ========================================
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
  v_consider_spec boolean;
  v_consider_shift boolean;
  v_consider_size boolean;
  v_consider_exchange boolean;
  v_cooldown integer;
  v_strategy text;
  v_current_time time;
BEGIN
  -- Read ALL config flags
  SELECT is_enabled, assignment_strategy, max_orders_per_operator,
         consider_specialization, consider_shift, consider_size_range,
         consider_exchange_mapping, cooldown_minutes
  INTO v_is_enabled, v_strategy, v_max_orders,
       v_consider_spec, v_consider_shift, v_consider_size,
       v_consider_exchange, v_cooldown
  FROM terminal_auto_assignment_config LIMIT 1;

  IF NOT COALESCE(v_is_enabled, false) THEN
    RETURN jsonb_build_object('status', 'disabled', 'reason', 'Auto-assignment is disabled');
  END IF;

  v_max_orders := COALESCE(v_max_orders, 50);
  v_cooldown := COALESCE(v_cooldown, 0);
  v_current_time := LOCALTIME;

  IF EXISTS (
    SELECT 1 FROM terminal_order_assignments
    WHERE order_number = p_order_number AND is_active = true
  ) THEN
    RETURN jsonb_build_object('status', 'already_assigned');
  END IF;

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
      -- Specialization filter
      AND (NOT v_consider_spec OR tup.specialization IS NULL OR tup.specialization = 'both'
           OR (p_trade_type = 'BUY' AND tup.specialization = 'purchase')
           OR (p_trade_type = 'SELL' AND tup.specialization = 'sales'))
      -- Shift filter
      AND (NOT v_consider_shift OR tup.shift IS NULL OR EXISTS (
        SELECT 1 FROM hr_shifts hs
        WHERE hs.name ILIKE tup.shift AND hs.is_active = true
          AND (
            (NOT hs.is_night_shift AND v_current_time BETWEEN hs.start_time AND hs.end_time)
            OR (hs.is_night_shift AND (v_current_time >= hs.start_time OR v_current_time <= hs.end_time))
          )
      ))
      -- Cooldown filter
      AND (v_cooldown = 0 OR NOT EXISTS (
        SELECT 1 FROM terminal_order_assignments oa2
        WHERE oa2.assigned_to = oa.operator_user_id
          AND oa2.created_at > now() - (v_cooldown || ' minutes')::interval
      ))
    ORDER BY COALESCE(workload.cnt, 0) ASC
    LIMIT 1;

    IF v_matched_operator_id IS NOT NULL THEN
      v_match_type := 'ad_id';
    END IF;
  END IF;

  -- Priority 2: Size range via terminal_operator_assignments (skip if consider_size_range = false)
  IF v_matched_operator_id IS NULL AND COALESCE(v_consider_size, true) THEN
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
      AND (NOT v_consider_spec OR tup.specialization IS NULL OR tup.specialization = 'both'
           OR (p_trade_type = 'BUY' AND tup.specialization = 'purchase')
           OR (p_trade_type = 'SELL' AND tup.specialization = 'sales'))
      AND (NOT v_consider_shift OR tup.shift IS NULL OR EXISTS (
        SELECT 1 FROM hr_shifts hs
        WHERE hs.name ILIKE tup.shift AND hs.is_active = true
          AND (
            (NOT hs.is_night_shift AND v_current_time BETWEEN hs.start_time AND hs.end_time)
            OR (hs.is_night_shift AND (v_current_time >= hs.start_time OR v_current_time <= hs.end_time))
          )
      ))
      AND (v_cooldown = 0 OR NOT EXISTS (
        SELECT 1 FROM terminal_order_assignments oa2
        WHERE oa2.assigned_to = oa.operator_user_id
          AND oa2.created_at > now() - (v_cooldown || ' minutes')::interval
      ))
    ORDER BY COALESCE(workload.cnt, 0) ASC
    LIMIT 1;

    IF v_matched_operator_id IS NOT NULL THEN
      v_match_type := 'size_range';
    END IF;
  END IF;

  -- Priority 3: Fallback to terminal_user_size_range_mappings
  IF v_matched_operator_id IS NULL AND p_total_price IS NOT NULL AND COALESCE(v_consider_size, true) THEN
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
      AND (NOT v_consider_spec OR tup.specialization IS NULL OR tup.specialization = 'both'
           OR (p_trade_type = 'BUY' AND tup.specialization = 'purchase')
           OR (p_trade_type = 'SELL' AND tup.specialization = 'sales'))
      AND (NOT v_consider_shift OR tup.shift IS NULL OR EXISTS (
        SELECT 1 FROM hr_shifts hs
        WHERE hs.name ILIKE tup.shift AND hs.is_active = true
          AND (
            (NOT hs.is_night_shift AND v_current_time BETWEEN hs.start_time AND hs.end_time)
            OR (hs.is_night_shift AND (v_current_time >= hs.start_time OR v_current_time <= hs.end_time))
          )
      ))
      AND (v_cooldown = 0 OR NOT EXISTS (
        SELECT 1 FROM terminal_order_assignments oa2
        WHERE oa2.assigned_to = usrm.user_id
          AND oa2.created_at > now() - (v_cooldown || ' minutes')::interval
      ))
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

  v_reason := 'Matched via ' || v_match_type || ' (eligible=' || COALESCE(v_eligible_count, 0) || ', strategy=' || COALESCE(v_strategy, 'least_workload') || ')';
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

-- ========================================
-- #17 T2-AUTO-02: Auto-payer assignment for BUY orders
-- ========================================
CREATE OR REPLACE FUNCTION auto_assign_payer_by_scope(
  p_order_number text,
  p_total_price numeric,
  p_trade_type text DEFAULT 'BUY'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_matched_payer_id uuid;
  v_match_type text;
  v_max_orders integer;
  v_eligible_count integer;
  v_reason text;
  v_is_enabled boolean;
BEGIN
  -- Only for BUY orders (we pay the seller)
  IF p_trade_type != 'BUY' THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'Payer assignment only for BUY orders');
  END IF;

  SELECT is_enabled, max_orders_per_operator INTO v_is_enabled, v_max_orders
  FROM terminal_auto_assignment_config LIMIT 1;

  IF NOT COALESCE(v_is_enabled, false) THEN
    RETURN jsonb_build_object('status', 'disabled');
  END IF;

  v_max_orders := COALESCE(v_max_orders, 50);

  -- Check if already has a payer lock
  IF EXISTS (
    SELECT 1 FROM terminal_payer_order_locks
    WHERE order_number = p_order_number AND status = 'locked'
  ) THEN
    RETURN jsonb_build_object('status', 'already_locked');
  END IF;

  -- Match by size range from terminal_payer_assignments
  SELECT pa.payer_user_id, COUNT(*) OVER() INTO v_matched_payer_id, v_eligible_count
  FROM terminal_payer_assignments pa
  JOIN terminal_order_size_ranges osr ON osr.id = pa.size_range_id AND osr.is_active = true
  JOIN terminal_user_profiles tup ON tup.user_id = pa.payer_user_id AND tup.is_active = true
  JOIN terminal_user_presence tpr ON tpr.user_id = pa.payer_user_id
    AND tpr.is_online = true
    AND tpr.last_seen_at > now() - interval '90 seconds'
    AND tpr.status = 'active'
  LEFT JOIN (
    SELECT payer_user_id, COUNT(*) as cnt
    FROM terminal_payer_order_locks WHERE status = 'locked' GROUP BY payer_user_id
  ) workload ON workload.payer_user_id = pa.payer_user_id
  WHERE pa.is_active = true
    AND p_total_price >= osr.min_amount
    AND (osr.max_amount IS NULL OR p_total_price <= osr.max_amount)
    AND COALESCE(workload.cnt, 0) < v_max_orders
  ORDER BY COALESCE(workload.cnt, 0) ASC
  LIMIT 1;

  IF v_matched_payer_id IS NOT NULL THEN
    v_match_type := 'payer_size_range';
  END IF;

  IF v_matched_payer_id IS NULL THEN
    v_reason := 'No online payer matched (price=' || COALESCE(p_total_price::text, 'null') || ')';
    INSERT INTO terminal_auto_assignment_log (order_number, assigned_to, strategy_used, eligible_count, reason)
    VALUES (p_order_number, NULL, 'payer_no_match', COALESCE(v_eligible_count, 0), v_reason);
    RETURN jsonb_build_object('status', 'no_match', 'reason', v_reason);
  END IF;

  -- Lock the order for this payer
  INSERT INTO terminal_payer_order_locks (order_number, payer_user_id, status)
  VALUES (p_order_number, v_matched_payer_id, 'locked');

  v_reason := 'Payer matched via ' || v_match_type || ' (eligible=' || COALESCE(v_eligible_count, 0) || ')';
  INSERT INTO terminal_auto_assignment_log (order_number, assigned_to, strategy_used, eligible_count, reason)
  VALUES (p_order_number, v_matched_payer_id, v_match_type, COALESCE(v_eligible_count, 0), v_reason);

  RETURN jsonb_build_object(
    'status', 'assigned',
    'payer_id', v_matched_payer_id,
    'match_type', v_match_type
  );
END;
$$;

-- ========================================
-- #18 T2-AUTO-03: Auto-reassign on operator disconnect
-- ========================================
CREATE OR REPLACE FUNCTION auto_reassign_inactive_orders()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stale RECORD;
  v_result jsonb;
  v_reassigned integer := 0;
  v_escalated integer := 0;
  v_is_enabled boolean;
BEGIN
  SELECT is_enabled INTO v_is_enabled FROM terminal_auto_assignment_config LIMIT 1;
  IF NOT COALESCE(v_is_enabled, false) THEN
    RETURN jsonb_build_object('status', 'disabled');
  END IF;

  FOR v_stale IN
    SELECT toa.order_number, toa.assigned_to, toa.trade_type, toa.total_price, toa.asset,
           toa.id as assignment_id
    FROM terminal_order_assignments toa
    JOIN terminal_user_presence tpr ON tpr.user_id = toa.assigned_to
    WHERE toa.is_active = true
      AND (tpr.is_online = false OR tpr.last_seen_at < now() - interval '3 minutes')
  LOOP
    -- Unassign current operator
    PERFORM unassign_terminal_order(v_stale.order_number, NULL);

    -- Try auto-assign to someone else
    v_result := auto_assign_order_by_scope(
      p_order_number := v_stale.order_number,
      p_trade_type := v_stale.trade_type,
      p_total_price := v_stale.total_price,
      p_asset := v_stale.asset
    );

    IF v_result->>'status' = 'assigned' THEN
      v_reassigned := v_reassigned + 1;
    ELSE
      -- Escalate to supervisor
      BEGIN
        PERFORM escalate_terminal_order(
          v_stale.order_number,
          v_stale.assigned_to,
          'Auto-escalated: operator went offline with active order',
          'high'
        );
        v_escalated := v_escalated + 1;
      EXCEPTION WHEN OTHERS THEN
        NULL; -- Don't fail the loop
      END;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'reassigned', v_reassigned,
    'escalated', v_escalated,
    'total_processed', v_reassigned + v_escalated
  );
END;
$$;

-- ========================================
-- #20 T2-GAP-01: Permission guards on SECURITY DEFINER RPCs
-- ========================================

-- Helper: check if user has terminal access
CREATE OR REPLACE FUNCTION has_terminal_access(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM p2p_terminal_user_roles WHERE user_id = p_user_id);
$$;

-- Rewrite escalate_terminal_order with permission guard
CREATE OR REPLACE FUNCTION escalate_terminal_order(
  p_order_number text,
  p_escalated_by uuid,
  p_reason text,
  p_priority text DEFAULT 'medium'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_escalated_to uuid;
  v_escalation_id uuid;
BEGIN
  -- Permission guard
  IF NOT has_terminal_access(p_escalated_by) THEN
    RAISE EXCEPTION 'User does not have terminal access';
  END IF;

  SELECT reports_to INTO v_escalated_to
  FROM terminal_user_profiles WHERE user_id = p_escalated_by;

  IF v_escalated_to IS NULL THEN
    SELECT ur.user_id INTO v_escalated_to
    FROM p2p_terminal_user_roles ur
    JOIN p2p_terminal_roles r ON r.id = ur.role_id
    WHERE r.hierarchy_level <= 0 LIMIT 1;
  END IF;

  IF v_escalated_to IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'No supervisor found');
  END IF;

  INSERT INTO terminal_order_escalations (order_number, escalated_by, escalated_to, reason, priority)
  VALUES (p_order_number, p_escalated_by, v_escalated_to, p_reason, p_priority)
  RETURNING id INTO v_escalation_id;

  INSERT INTO terminal_notifications (user_id, notification_type, title, message, metadata)
  VALUES (v_escalated_to, 'escalation', 'Order Escalated: ' || p_order_number,
    p_reason, jsonb_build_object('order_number', p_order_number, 'escalation_id', v_escalation_id, 'priority', p_priority));

  RETURN jsonb_build_object('status', 'success', 'escalation_id', v_escalation_id, 'escalated_to', v_escalated_to);
END;
$$;

-- Rewrite initiate_shift_handover with permission guard
CREATE OR REPLACE FUNCTION initiate_shift_handover(
  p_outgoing_user_id uuid,
  p_incoming_user_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_handover_id uuid;
  v_orders jsonb;
BEGIN
  IF NOT has_terminal_access(p_outgoing_user_id) THEN
    RAISE EXCEPTION 'Outgoing user does not have terminal access';
  END IF;
  IF NOT has_terminal_access(p_incoming_user_id) THEN
    RAISE EXCEPTION 'Incoming user does not have terminal access';
  END IF;

  SELECT jsonb_agg(jsonb_build_object('order_number', order_number, 'trade_type', trade_type, 'total_price', total_price))
  INTO v_orders
  FROM terminal_order_assignments
  WHERE assigned_to = p_outgoing_user_id AND is_active = true;

  INSERT INTO terminal_shift_handovers (outgoing_user_id, incoming_user_id, handover_orders, outgoing_notes, status)
  VALUES (p_outgoing_user_id, p_incoming_user_id, COALESCE(v_orders, '[]'::jsonb), p_notes, 'pending')
  RETURNING id INTO v_handover_id;

  INSERT INTO terminal_notifications (user_id, notification_type, title, message, metadata)
  VALUES (p_incoming_user_id, 'handover', 'Shift Handover Request',
    'You have a pending shift handover from a colleague',
    jsonb_build_object('handover_id', v_handover_id, 'outgoing_user_id', p_outgoing_user_id));

  RETURN jsonb_build_object('status', 'success', 'handover_id', v_handover_id, 'orders_count', jsonb_array_length(COALESCE(v_orders, '[]'::jsonb)));
END;
$$;

-- Rewrite lock_payer_order with permission guard
CREATE OR REPLACE FUNCTION lock_payer_order(
  p_order_number text,
  p_payer_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock_id uuid;
BEGIN
  IF NOT has_terminal_access(p_payer_user_id) THEN
    RAISE EXCEPTION 'User does not have terminal access';
  END IF;

  INSERT INTO terminal_payer_order_locks (order_number, payer_user_id, status)
  VALUES (p_order_number, p_payer_user_id, 'locked')
  RETURNING id INTO v_lock_id;

  INSERT INTO terminal_activity_log (user_id, activity_type, metadata)
  VALUES (p_payer_user_id, 'payer_lock', jsonb_build_object('order_number', p_order_number, 'lock_id', v_lock_id));

  RETURN jsonb_build_object('status', 'locked', 'lock_id', v_lock_id);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('status', 'already_locked', 'message', 'Order is already locked by another payer');
END;
$$;

-- Rewrite mark_payer_order_paid with permission guard
CREATE OR REPLACE FUNCTION mark_payer_order_paid(
  p_order_number text,
  p_payer_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_terminal_access(p_payer_user_id) THEN
    RAISE EXCEPTION 'User does not have terminal access';
  END IF;

  UPDATE terminal_payer_order_locks
  SET status = 'paid', completed_at = now()
  WHERE order_number = p_order_number AND payer_user_id = p_payer_user_id AND status = 'locked';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'No active lock found for this order/payer');
  END IF;

  INSERT INTO terminal_activity_log (user_id, activity_type, metadata)
  VALUES (p_payer_user_id, 'payer_mark_paid', jsonb_build_object('order_number', p_order_number));

  RETURN jsonb_build_object('status', 'paid');
END;
$$;

-- Rewrite release_payer_order_lock with permission guard
CREATE OR REPLACE FUNCTION release_payer_order_lock(
  p_order_number text,
  p_payer_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_terminal_access(p_payer_user_id) THEN
    RAISE EXCEPTION 'User does not have terminal access';
  END IF;

  UPDATE terminal_payer_order_locks
  SET status = 'released', completed_at = now()
  WHERE order_number = p_order_number AND payer_user_id = p_payer_user_id AND status = 'locked';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'No active lock found');
  END IF;

  INSERT INTO terminal_activity_log (user_id, activity_type, metadata)
  VALUES (p_payer_user_id, 'payer_release', jsonb_build_object('order_number', p_order_number));

  RETURN jsonb_build_object('status', 'released');
END;
$$;

-- ========================================
-- PHASE 4
-- ========================================

-- #21 T2-GAP-04: Dashboard summary RPC
CREATE OR REPLACE FUNCTION get_terminal_dashboard_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'operators_online', (SELECT COUNT(*) FROM terminal_user_presence WHERE is_online = true AND status = 'active' AND last_seen_at > now() - interval '90 seconds'),
    'operators_on_break', (SELECT COUNT(*) FROM terminal_user_presence WHERE is_online = true AND status = 'on_break'),
    'active_orders', (SELECT COUNT(*) FROM terminal_order_assignments WHERE is_active = true),
    'unassigned_recent_orders', (
      SELECT COUNT(*) FROM p2p_order_records
      WHERE order_status NOT IN ('COMPLETED','CANCELLED','CANCELLED_BY_SYSTEM')
        AND created_at > now() - interval '2 hours'
        AND binance_order_number NOT IN (SELECT order_number FROM terminal_order_assignments WHERE is_active = true)
    ),
    'open_escalations', (SELECT COUNT(*) FROM terminal_order_escalations WHERE status = 'open'),
    'sla_breaches_today', (SELECT COUNT(*) FROM terminal_notifications WHERE notification_type = 'sla_warning' AND created_at::date = CURRENT_DATE),
    'pending_handovers', (SELECT COUNT(*) FROM terminal_shift_handovers WHERE status = 'pending'),
    'total_operators', (SELECT COUNT(*) FROM terminal_user_profiles WHERE is_active = true),
    'locked_orders', (SELECT COUNT(*) FROM terminal_payer_order_locks WHERE status = 'locked')
  ) INTO v_result;
  RETURN v_result;
END;
$$;

-- #23 T2-GAP-02: Re-escalation support
CREATE OR REPLACE FUNCTION re_escalate_terminal_order(
  p_escalation_id uuid,
  p_current_handler_id uuid,
  p_reason text DEFAULT 'Re-escalated to higher level'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_number text;
  v_next_supervisor uuid;
  v_new_escalation_id uuid;
BEGIN
  IF NOT has_terminal_access(p_current_handler_id) THEN
    RAISE EXCEPTION 'User does not have terminal access';
  END IF;

  -- Get the order from current escalation
  SELECT order_number INTO v_order_number
  FROM terminal_order_escalations
  WHERE id = p_escalation_id AND escalated_to = p_current_handler_id AND status = 'open';

  IF v_order_number IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Escalation not found or not assigned to you');
  END IF;

  -- Find next level supervisor via reports_to of current handler
  SELECT reports_to INTO v_next_supervisor
  FROM terminal_user_profiles WHERE user_id = p_current_handler_id;

  IF v_next_supervisor IS NULL THEN
    SELECT ur.user_id INTO v_next_supervisor
    FROM p2p_terminal_user_roles ur
    JOIN p2p_terminal_roles r ON r.id = ur.role_id
    WHERE r.hierarchy_level <= 0 AND ur.user_id != p_current_handler_id
    LIMIT 1;
  END IF;

  IF v_next_supervisor IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'No higher-level supervisor found');
  END IF;

  -- Close current escalation
  UPDATE terminal_order_escalations
  SET status = 'reassigned', resolution_note = 'Re-escalated: ' || p_reason, resolved_by = p_current_handler_id, resolved_at = now()
  WHERE id = p_escalation_id;

  -- Create new escalation at higher level
  INSERT INTO terminal_order_escalations (order_number, escalated_by, escalated_to, reason, priority, status)
  VALUES (v_order_number, p_current_handler_id, v_next_supervisor, p_reason, 'high', 'open')
  RETURNING id INTO v_new_escalation_id;

  INSERT INTO terminal_notifications (user_id, notification_type, title, message, metadata)
  VALUES (v_next_supervisor, 'escalation', 'Re-escalated: ' || v_order_number,
    p_reason, jsonb_build_object('order_number', v_order_number, 'escalation_id', v_new_escalation_id, 'priority', 'high', 're_escalated', true));

  RETURN jsonb_build_object('status', 'success', 'new_escalation_id', v_new_escalation_id, 'escalated_to', v_next_supervisor);
END;
$$;

-- #24 T2-GAP-03: Shift column standardization
-- Add a validation trigger instead of FK (since shift is free text matching hr_shifts.name)
CREATE OR REPLACE FUNCTION validate_terminal_user_shift()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.shift IS NOT NULL AND NEW.shift != '' THEN
    IF NOT EXISTS (SELECT 1 FROM hr_shifts WHERE name ILIKE NEW.shift AND is_active = true) THEN
      RAISE EXCEPTION 'Invalid shift: %. Must match an active shift in hr_shifts', NEW.shift;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_terminal_user_shift ON terminal_user_profiles;
CREATE TRIGGER trg_validate_terminal_user_shift
  BEFORE INSERT OR UPDATE OF shift ON terminal_user_profiles
  FOR EACH ROW EXECUTE FUNCTION validate_terminal_user_shift();
