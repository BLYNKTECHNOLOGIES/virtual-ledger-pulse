
-- ====================================================================
-- TERMINAL MODULE V1 FIXES — ALL PHASES
-- ====================================================================

-- ====================================================================
-- PHASE 1: BUG FIXES
-- ====================================================================

-- T-BUG-01: Super Admin permissions fix
-- Fix get_terminal_permissions to return ALL permissions for admin-level roles
CREATE OR REPLACE FUNCTION get_terminal_permissions(p_user_id uuid)
RETURNS SETOF text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admin-level users (hierarchy_level <= 0) get ALL permissions
  IF EXISTS (
    SELECT 1 FROM p2p_terminal_user_roles ur
    JOIN p2p_terminal_roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_user_id AND r.hierarchy_level <= 0
  ) THEN
    RETURN QUERY SELECT e.enumlabel::text FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'terminal_permission';
    RETURN;
  END IF;

  -- Normal permission lookup
  RETURN QUERY
  SELECT DISTINCT rp.permission::TEXT
  FROM p2p_terminal_user_roles ur
  JOIN p2p_terminal_role_permissions rp ON rp.role_id = ur.role_id
  WHERE ur.user_id = p_user_id;
END;
$$;

-- Fix get_terminal_visible_user_ids to include Super Admin (hierarchy_level <= 0)
CREATE OR REPLACE FUNCTION get_terminal_visible_user_ids(p_user_id uuid)
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean := false;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM p2p_terminal_user_roles tur
    JOIN p2p_terminal_roles tr ON tr.id = tur.role_id
    WHERE tur.user_id = p_user_id AND tr.hierarchy_level <= 0
  ) INTO v_is_admin;

  IF v_is_admin THEN
    RETURN QUERY SELECT DISTINCT tur.user_id FROM p2p_terminal_user_roles tur;
    RETURN;
  END IF;

  RETURN QUERY SELECT p_user_id;
  RETURN QUERY SELECT sub.user_id FROM get_terminal_subordinates(p_user_id) sub;
END;
$$;


-- T-BUG-02: Purchase sync review enforcement trigger
CREATE TRIGGER trg_enforce_terminal_purchase_sync_review_actor
  BEFORE INSERT OR UPDATE OF sync_status, reviewed_by, reviewed_at
  ON terminal_purchase_sync
  FOR EACH ROW
  EXECUTE FUNCTION enforce_sales_sync_review_actor();


-- T-BUG-03: Populate Assistant Manager with Team Lead permissions
INSERT INTO p2p_terminal_role_permissions (role_id, permission)
SELECT '02dd0743-a298-407d-9c68-43752ef4a6a1'::uuid, rp.permission
FROM p2p_terminal_role_permissions rp
JOIN p2p_terminal_roles r ON r.id = rp.role_id
WHERE r.name = 'Team Lead'
ON CONFLICT DO NOTHING;


-- T-BUG-04: Auto-assignment with online check, max orders, and decision logging
CREATE OR REPLACE FUNCTION auto_assign_order_by_scope(
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
BEGIN
  -- Skip if already assigned
  IF EXISTS (
    SELECT 1 FROM terminal_order_assignments
    WHERE order_number = p_order_number AND is_active = true
  ) THEN
    RETURN jsonb_build_object('status', 'already_assigned');
  END IF;

  -- Get max orders per operator from config
  SELECT max_orders_per_operator INTO v_max_orders
  FROM terminal_auto_assignment_config LIMIT 1;
  v_max_orders := COALESCE(v_max_orders, 50);

  -- Priority 1: Match by Ad ID (least workload, online only, under cap)
  IF p_adv_no IS NOT NULL THEN
    SELECT oa.operator_user_id, COUNT(*) OVER() INTO v_matched_operator_id, v_eligible_count
    FROM terminal_operator_assignments oa
    JOIN terminal_user_profiles tup ON tup.user_id = oa.operator_user_id AND tup.is_active = true
    JOIN terminal_user_presence tpr ON tpr.user_id = oa.operator_user_id
      AND tpr.is_online = true
      AND tpr.last_seen_at > now() - interval '90 seconds'
    LEFT JOIN (
      SELECT assigned_to, COUNT(*) as cnt
      FROM terminal_order_assignments
      WHERE is_active = true
      GROUP BY assigned_to
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

  -- Priority 2: Match by size range (least workload, online only, under cap)
  IF v_matched_operator_id IS NULL THEN
    SELECT oa.operator_user_id, COUNT(*) OVER() INTO v_matched_operator_id, v_eligible_count
    FROM terminal_operator_assignments oa
    JOIN terminal_order_size_ranges osr ON osr.id = oa.size_range_id AND osr.is_active = true
    JOIN terminal_user_profiles tup ON tup.user_id = oa.operator_user_id AND tup.is_active = true
    JOIN terminal_user_presence tpr ON tpr.user_id = oa.operator_user_id
      AND tpr.is_online = true
      AND tpr.last_seen_at > now() - interval '90 seconds'
    LEFT JOIN (
      SELECT assigned_to, COUNT(*) as cnt
      FROM terminal_order_assignments
      WHERE is_active = true
      GROUP BY assigned_to
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

  IF v_matched_operator_id IS NULL THEN
    v_reason := 'No online operator matched (ad_id=' || COALESCE(p_adv_no, 'null') || ', price=' || COALESCE(p_total_price::text, 'null') || ')';
    -- Log the no-match decision
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
  -- Log the assignment decision
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


-- T-BUG-05: Cleanup function for stale terminal data
CREATE OR REPLACE FUNCTION cleanup_terminal_stale_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. Deactivate expired biometric sessions
  UPDATE terminal_biometric_sessions
  SET is_active = false
  WHERE is_active = true AND expires_at < now();

  -- 2. Mark stale users as offline (no heartbeat for > 90 seconds)
  UPDATE terminal_user_presence
  SET is_online = false, updated_at = now()
  WHERE is_online = true AND last_seen_at < now() - interval '90 seconds';

  -- 3. Delete expired WebAuthn challenges
  DELETE FROM terminal_webauthn_challenges
  WHERE expires_at < now();

  -- 4. Delete expired unused bypass codes
  DELETE FROM terminal_bypass_codes
  WHERE is_used = false AND expires_at < now();

  -- 5. Prune old inactive notifications (older than 30 days)
  DELETE FROM terminal_notifications
  WHERE is_active = false AND created_at < now() - interval '30 days';

  -- 6. Prune old inactive biometric sessions (older than 7 days)
  DELETE FROM terminal_biometric_sessions
  WHERE is_active = false AND expires_at < now() - interval '7 days';
END;
$$;

-- Schedule cleanup cron (every 15 minutes)
SELECT cron.schedule('terminal-cleanup', '*/15 * * * *', $$SELECT cleanup_terminal_stale_data()$$);


-- T-BUG-06: Standardize token generation in bypass code validation
CREATE OR REPLACE FUNCTION validate_terminal_bypass_code(p_user_id uuid, p_code text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bypass_id uuid;
  v_token text;
BEGIN
  SELECT id INTO v_bypass_id
  FROM public.terminal_bypass_codes
  WHERE user_id = p_user_id
    AND code = p_code
    AND is_used = false
    AND expires_at > now();
  
  IF v_bypass_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  UPDATE public.terminal_bypass_codes
  SET is_used = true, used_at = now()
  WHERE id = v_bypass_id;
  
  -- Standardized: use gen_random_bytes(32) like create_terminal_biometric_session
  v_token := encode(gen_random_bytes(32), 'hex');
  
  UPDATE public.terminal_biometric_sessions
  SET is_active = false
  WHERE user_id = p_user_id AND is_active = true;
  
  INSERT INTO public.terminal_biometric_sessions (user_id, session_token)
  VALUES (p_user_id, v_token);
  
  RETURN v_token;
END;
$$;


-- ====================================================================
-- PERFORMANCE INDEXES (T-PERF-01, 02, 03)
-- ====================================================================

-- T-PERF-01: Assignment audit log indexes
CREATE INDEX IF NOT EXISTS idx_terminal_audit_logs_user ON terminal_assignment_audit_logs (target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_terminal_audit_logs_order ON terminal_assignment_audit_logs (order_reference);
CREATE INDEX IF NOT EXISTS idx_terminal_audit_logs_created ON terminal_assignment_audit_logs (created_at DESC);

-- T-PERF-02: Purchase sync indexes
CREATE INDEX IF NOT EXISTS idx_terminal_purchase_sync_status ON terminal_purchase_sync (sync_status);
CREATE INDEX IF NOT EXISTS idx_terminal_purchase_sync_client ON terminal_purchase_sync (client_id);

-- T-PERF-03: Notifications composite index
CREATE INDEX IF NOT EXISTS idx_terminal_notifications_user_active ON terminal_notifications (user_id, is_active, created_at DESC);


-- ====================================================================
-- PHASE 2: CORE PRODUCTION FEATURES
-- ====================================================================

-- T-MISS-01: Terminal Activity Log
CREATE TABLE IF NOT EXISTS terminal_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  activity_type text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_terminal_activity_log_user ON terminal_activity_log (user_id, created_at DESC);
CREATE INDEX idx_terminal_activity_log_type ON terminal_activity_log (activity_type, created_at DESC);

ALTER TABLE terminal_activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_terminal_activity_log" ON terminal_activity_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Update create_terminal_biometric_session to log activity
CREATE OR REPLACE FUNCTION create_terminal_biometric_session(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
BEGIN
  UPDATE public.terminal_biometric_sessions
  SET is_active = false
  WHERE user_id = p_user_id AND is_active = true;

  v_token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO public.terminal_biometric_sessions (user_id, session_token)
  VALUES (p_user_id, v_token);

  -- Log login activity
  INSERT INTO terminal_activity_log (user_id, activity_type, metadata)
  VALUES (p_user_id, 'login_biometric', '{}');

  RETURN v_token;
END;
$$;

-- Update validate_terminal_bypass_code to log activity
CREATE OR REPLACE FUNCTION validate_terminal_bypass_code(p_user_id uuid, p_code text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bypass_id uuid;
  v_token text;
BEGIN
  SELECT id INTO v_bypass_id
  FROM public.terminal_bypass_codes
  WHERE user_id = p_user_id
    AND code = p_code
    AND is_used = false
    AND expires_at > now();
  
  IF v_bypass_id IS NULL THEN
    -- Log failed attempt
    INSERT INTO terminal_activity_log (user_id, activity_type, metadata)
    VALUES (p_user_id, 'login_failed', jsonb_build_object('method', 'bypass_code'));
    RETURN NULL;
  END IF;
  
  UPDATE public.terminal_bypass_codes
  SET is_used = true, used_at = now()
  WHERE id = v_bypass_id;
  
  v_token := encode(gen_random_bytes(32), 'hex');
  
  UPDATE public.terminal_biometric_sessions
  SET is_active = false
  WHERE user_id = p_user_id AND is_active = true;
  
  INSERT INTO public.terminal_biometric_sessions (user_id, session_token)
  VALUES (p_user_id, v_token);

  -- Log successful bypass login
  INSERT INTO terminal_activity_log (user_id, activity_type, metadata)
  VALUES (p_user_id, 'login_bypass', '{}');
  
  RETURN v_token;
END;
$$;

-- Update mark_terminal_user_offline to log activity
CREATE OR REPLACE FUNCTION mark_terminal_user_offline(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE terminal_user_presence
  SET is_online = false, updated_at = now()
  WHERE user_id = p_user_id;

  -- Log logout
  INSERT INTO terminal_activity_log (user_id, activity_type, metadata)
  VALUES (p_user_id, 'logout', '{}');
END;
$$;


-- T-MISS-02: MPI Snapshot Generation Function
CREATE OR REPLACE FUNCTION generate_terminal_mpi_snapshots(p_date date DEFAULT CURRENT_DATE)
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
BEGIN
  FOR v_user IN
    SELECT user_id FROM terminal_user_profiles WHERE is_active = true
  LOOP
    -- Count orders handled (assigned on this date)
    SELECT COUNT(*) INTO v_orders_handled
    FROM terminal_order_assignments
    WHERE assigned_to = v_user.user_id
      AND created_at::date = p_date;

    -- Count completed orders (from p2p_order_records)
    SELECT 
      COUNT(*) FILTER (WHERE por.order_status IN ('5', 'COMPLETED')),
      COUNT(*) FILTER (WHERE por.order_status IN ('8', 'CANCELLED', '9', 'EXPIRED')),
      COALESCE(SUM(CASE WHEN por.order_status IN ('5', 'COMPLETED') THEN por.total_price::numeric ELSE 0 END), 0),
      COUNT(*) FILTER (WHERE por.trade_type = 'BUY'),
      COUNT(*) FILTER (WHERE por.trade_type = 'SELL'),
      COALESCE(AVG(CASE 
        WHEN por.order_status IN ('5', 'COMPLETED') AND por.completed_at IS NOT NULL 
        THEN EXTRACT(EPOCH FROM (por.completed_at - por.created_at)) / 60.0 
        ELSE NULL 
      END), 0)
    INTO v_orders_completed, v_orders_cancelled, v_total_volume, v_buy_count, v_sell_count, v_avg_time
    FROM terminal_order_assignments toa
    LEFT JOIN p2p_order_records por ON por.order_number = toa.order_number
    WHERE toa.assigned_to = v_user.user_id
      AND toa.created_at::date = p_date;

    -- Upsert snapshot
    INSERT INTO terminal_mpi_snapshots (
      user_id, snapshot_date, orders_handled, orders_completed, orders_cancelled,
      total_volume, avg_completion_time_minutes, buy_count, sell_count, idle_time_minutes
    ) VALUES (
      v_user.user_id, p_date, v_orders_handled, v_orders_completed, v_orders_cancelled,
      v_total_volume, round(v_avg_time::numeric, 2), v_buy_count, v_sell_count, 0
    )
    ON CONFLICT (user_id, snapshot_date) DO UPDATE SET
      orders_handled = EXCLUDED.orders_handled,
      orders_completed = EXCLUDED.orders_completed,
      orders_cancelled = EXCLUDED.orders_cancelled,
      total_volume = EXCLUDED.total_volume,
      avg_completion_time_minutes = EXCLUDED.avg_completion_time_minutes,
      buy_count = EXCLUDED.buy_count,
      sell_count = EXCLUDED.sell_count;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- Schedule MPI cron (daily at 12:30 AM for previous day)
SELECT cron.schedule('terminal-mpi-snapshot', '30 0 * * *', $$SELECT generate_terminal_mpi_snapshots(CURRENT_DATE - 1)$$);


-- T-MISS-03: Payer Atomic RPCs
CREATE OR REPLACE FUNCTION lock_payer_order(p_order_number text, p_payer_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock_id uuid;
BEGIN
  -- Verify payer is active
  IF NOT EXISTS (SELECT 1 FROM terminal_user_profiles WHERE user_id = p_payer_user_id AND is_active = true) THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Payer is not active');
  END IF;

  -- Insert lock (partial unique index handles race conditions)
  BEGIN
    INSERT INTO terminal_payer_order_locks (order_number, payer_user_id, status)
    VALUES (p_order_number, p_payer_user_id, 'locked')
    RETURNING id INTO v_lock_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Order already locked by another payer');
  END;

  -- Log action
  INSERT INTO terminal_payer_order_log (order_number, payer_id, action)
  VALUES (p_order_number, p_payer_user_id, 'locked');

  RETURN jsonb_build_object('status', 'success', 'lock_id', v_lock_id);
END;
$$;

CREATE OR REPLACE FUNCTION mark_payer_order_paid(p_order_number text, p_payer_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify active lock exists for this payer
  IF NOT EXISTS (
    SELECT 1 FROM terminal_payer_order_locks
    WHERE order_number = p_order_number AND payer_user_id = p_payer_user_id AND status = 'locked'
  ) THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'No active lock found for this payer');
  END IF;

  -- Update lock to completed
  UPDATE terminal_payer_order_locks
  SET status = 'completed', completed_at = now()
  WHERE order_number = p_order_number AND payer_user_id = p_payer_user_id AND status = 'locked';

  -- Log action
  INSERT INTO terminal_payer_order_log (order_number, payer_id, action)
  VALUES (p_order_number, p_payer_user_id, 'marked_paid');

  RETURN jsonb_build_object('status', 'success');
END;
$$;

CREATE OR REPLACE FUNCTION release_payer_order_lock(p_order_number text, p_payer_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify active lock exists
  IF NOT EXISTS (
    SELECT 1 FROM terminal_payer_order_locks
    WHERE order_number = p_order_number AND payer_user_id = p_payer_user_id AND status = 'locked'
  ) THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'No active lock found');
  END IF;

  -- Release lock
  UPDATE terminal_payer_order_locks
  SET status = 'released', completed_at = now()
  WHERE order_number = p_order_number AND payer_user_id = p_payer_user_id AND status = 'locked';

  -- Log action
  INSERT INTO terminal_payer_order_log (order_number, payer_id, action)
  VALUES (p_order_number, p_payer_user_id, 'released');

  RETURN jsonb_build_object('status', 'success');
END;
$$;


-- ====================================================================
-- PHASE 3: OPERATIONAL MATURITY FEATURES
-- ====================================================================

-- T-MISS-04: Order Escalation System
CREATE TABLE IF NOT EXISTS terminal_order_escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL,
  escalated_by uuid NOT NULL REFERENCES auth.users(id),
  escalated_to uuid NOT NULL REFERENCES auth.users(id),
  reason text NOT NULL,
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'open',
  resolution_note text,
  resolved_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX idx_escalations_order ON terminal_order_escalations (order_number);
CREATE INDEX idx_escalations_to ON terminal_order_escalations (escalated_to, status, created_at DESC);

ALTER TABLE terminal_order_escalations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_terminal_order_escalations" ON terminal_order_escalations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION escalate_terminal_order(
  p_order_number text,
  p_escalated_by uuid,
  p_reason text,
  p_priority text DEFAULT 'normal'
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
  -- Get supervisor from reports_to
  SELECT reports_to INTO v_escalated_to
  FROM terminal_user_profiles
  WHERE user_id = p_escalated_by;

  IF v_escalated_to IS NULL THEN
    -- Fall back to any admin
    SELECT ur.user_id INTO v_escalated_to
    FROM p2p_terminal_user_roles ur
    JOIN p2p_terminal_roles r ON r.id = ur.role_id
    WHERE r.hierarchy_level <= 0
    LIMIT 1;
  END IF;

  IF v_escalated_to IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'No supervisor found');
  END IF;

  INSERT INTO terminal_order_escalations (order_number, escalated_by, escalated_to, reason, priority)
  VALUES (p_order_number, p_escalated_by, v_escalated_to, p_reason, p_priority)
  RETURNING id INTO v_escalation_id;

  -- Notify supervisor
  INSERT INTO terminal_notifications (user_id, notification_type, title, message, metadata)
  VALUES (v_escalated_to, 'escalation', 'Order Escalated: ' || p_order_number,
    p_reason, jsonb_build_object('order_number', p_order_number, 'escalation_id', v_escalation_id, 'priority', p_priority));

  RETURN jsonb_build_object('status', 'success', 'escalation_id', v_escalation_id, 'escalated_to', v_escalated_to);
END;
$$;

CREATE OR REPLACE FUNCTION resolve_terminal_escalation(
  p_escalation_id uuid,
  p_resolved_by uuid,
  p_resolution_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE terminal_order_escalations
  SET status = 'resolved', resolved_by = p_resolved_by, resolution_note = p_resolution_note, resolved_at = now()
  WHERE id = p_escalation_id AND status IN ('open', 'acknowledged');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Escalation not found or already resolved');
  END IF;

  RETURN jsonb_build_object('status', 'success');
END;
$$;


-- T-MISS-05: Break/Pause Status
ALTER TABLE terminal_user_presence ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';


-- T-MISS-06: Order SLA Tracking Function
CREATE OR REPLACE FUNCTION check_terminal_order_sla()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment RECORD;
  v_count integer := 0;
  v_supervisor_id uuid;
BEGIN
  FOR v_assignment IN
    SELECT toa.order_number, toa.assigned_to, toa.created_at,
           EXTRACT(EPOCH FROM (now() - toa.created_at)) / 60.0 AS age_minutes
    FROM terminal_order_assignments toa
    WHERE toa.is_active = true
      AND toa.created_at < now() - interval '10 minutes'
      -- Don't notify if we already sent SLA warning for this order in last 15 minutes
      AND NOT EXISTS (
        SELECT 1 FROM terminal_notifications tn
        WHERE tn.metadata->>'order_number' = toa.order_number
          AND tn.notification_type = 'sla_warning'
          AND tn.created_at > now() - interval '15 minutes'
      )
  LOOP
    -- Notify operator
    INSERT INTO terminal_notifications (user_id, notification_type, title, message, metadata)
    VALUES (v_assignment.assigned_to, 'sla_warning',
      'SLA Warning: Order ' || v_assignment.order_number,
      'Order has been assigned for ' || round(v_assignment.age_minutes) || ' minutes without completion.',
      jsonb_build_object('order_number', v_assignment.order_number, 'age_minutes', round(v_assignment.age_minutes)));

    -- Notify supervisor
    SELECT reports_to INTO v_supervisor_id FROM terminal_user_profiles WHERE user_id = v_assignment.assigned_to;
    IF v_supervisor_id IS NOT NULL THEN
      INSERT INTO terminal_notifications (user_id, notification_type, title, message, metadata)
      VALUES (v_supervisor_id, 'sla_warning',
        'SLA Warning: Order ' || v_assignment.order_number || ' (subordinate)',
        'Assigned operator has not completed order in ' || round(v_assignment.age_minutes) || ' minutes.',
        jsonb_build_object('order_number', v_assignment.order_number, 'assigned_to', v_assignment.assigned_to));
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- Schedule SLA check every 5 minutes
SELECT cron.schedule('terminal-sla-check', '*/5 * * * *', $$SELECT check_terminal_order_sla()$$);


-- T-MISS-08: Broadcast System
CREATE TABLE IF NOT EXISTS terminal_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text NOT NULL,
  broadcast_type text NOT NULL DEFAULT 'info',
  created_by uuid NOT NULL REFERENCES auth.users(id),
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE terminal_broadcasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_terminal_broadcasts" ON terminal_broadcasts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Enable realtime for broadcasts
ALTER PUBLICATION supabase_realtime ADD TABLE terminal_broadcasts;


-- T-MISS-09: Shift Handover Workflow
CREATE TABLE IF NOT EXISTS terminal_shift_handovers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outgoing_user_id uuid NOT NULL REFERENCES auth.users(id),
  incoming_user_id uuid NOT NULL REFERENCES auth.users(id),
  handover_orders jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'pending',
  outgoing_notes text,
  incoming_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX idx_handovers_incoming ON terminal_shift_handovers (incoming_user_id, status);
CREATE INDEX idx_handovers_outgoing ON terminal_shift_handovers (outgoing_user_id, status);

ALTER TABLE terminal_shift_handovers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_terminal_shift_handovers" ON terminal_shift_handovers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION initiate_shift_handover(
  p_outgoing_user_id uuid,
  p_incoming_user_id uuid,
  p_orders jsonb,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_handover_id uuid;
BEGIN
  INSERT INTO terminal_shift_handovers (outgoing_user_id, incoming_user_id, handover_orders, outgoing_notes)
  VALUES (p_outgoing_user_id, p_incoming_user_id, p_orders, p_notes)
  RETURNING id INTO v_handover_id;

  -- Notify incoming user
  INSERT INTO terminal_notifications (user_id, notification_type, title, message, metadata)
  VALUES (p_incoming_user_id, 'shift_handover', 'Shift Handover Request',
    'You have a pending shift handover with ' || jsonb_array_length(p_orders) || ' orders.',
    jsonb_build_object('handover_id', v_handover_id));

  RETURN jsonb_build_object('status', 'success', 'handover_id', v_handover_id);
END;
$$;

CREATE OR REPLACE FUNCTION complete_shift_handover(
  p_handover_id uuid,
  p_incoming_user_id uuid,
  p_accept boolean,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_handover RECORD;
  v_order RECORD;
BEGIN
  SELECT * INTO v_handover FROM terminal_shift_handovers
  WHERE id = p_handover_id AND incoming_user_id = p_incoming_user_id AND status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Handover not found or not pending');
  END IF;

  IF p_accept THEN
    -- Reassign all orders
    FOR v_order IN SELECT * FROM jsonb_array_elements(v_handover.handover_orders) LOOP
      PERFORM assign_terminal_order(
        p_order_number := v_order.value->>'order_number',
        p_assigned_to := p_incoming_user_id,
        p_assigned_by := p_incoming_user_id,
        p_assignment_type := 'handover'
      );
    END LOOP;

    UPDATE terminal_shift_handovers
    SET status = 'accepted', incoming_notes = p_notes, completed_at = now()
    WHERE id = p_handover_id;
  ELSE
    UPDATE terminal_shift_handovers
    SET status = 'rejected', incoming_notes = p_notes, completed_at = now()
    WHERE id = p_handover_id;

    -- Notify outgoing user
    INSERT INTO terminal_notifications (user_id, notification_type, title, message, metadata)
    VALUES (v_handover.outgoing_user_id, 'shift_handover', 'Handover Rejected',
      COALESCE(p_notes, 'No reason provided'),
      jsonb_build_object('handover_id', p_handover_id));
  END IF;

  RETURN jsonb_build_object('status', 'success', 'accepted', p_accept);
END;
$$;


-- T-MISS-10: Bypass Code Rate Limiting
CREATE OR REPLACE FUNCTION generate_terminal_bypass_code(p_user_id uuid, p_generated_by uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_recent_count integer;
BEGIN
  -- Rate limit: max 3 codes per user in 15 minutes
  SELECT COUNT(*) INTO v_recent_count
  FROM terminal_bypass_codes
  WHERE user_id = p_user_id AND created_at > now() - interval '15 minutes';

  IF v_recent_count >= 3 THEN
    RAISE EXCEPTION 'Rate limit exceeded. Maximum 3 bypass codes per 15 minutes.';
  END IF;

  v_code := lpad(floor(random() * 1000000)::text, 6, '0');
  
  -- Invalidate any existing unused codes for this user
  UPDATE public.terminal_bypass_codes
  SET is_used = true
  WHERE user_id = p_user_id AND is_used = false;
  
  INSERT INTO public.terminal_bypass_codes (user_id, code, generated_by)
  VALUES (p_user_id, v_code, p_generated_by);

  -- Log bypass code generation
  INSERT INTO terminal_activity_log (user_id, activity_type, metadata)
  VALUES (p_generated_by, 'bypass_code_generated', jsonb_build_object('target_user_id', p_user_id));
  
  RETURN v_code;
END;
$$;
