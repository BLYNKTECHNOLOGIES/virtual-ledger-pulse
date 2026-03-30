
-- Re-apply BUG-01 fix: leaderboard display_name crash
CREATE OR REPLACE FUNCTION public.get_terminal_mpi_leaderboard(p_from date, p_to date, p_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_result jsonb;
BEGIN
  SELECT jsonb_agg(row_data ORDER BY avg_score DESC) INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'user_id', s.user_id,
      'name', COALESCE(u.full_name, u.username, s.user_id::text),
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
    LEFT JOIN users u ON u.id = s.user_id
    WHERE s.snapshot_date >= p_from AND s.snapshot_date <= p_to
    GROUP BY s.user_id, u.full_name, u.username
    LIMIT p_limit
  ) ranked;
  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- Re-apply BUG-02: complete_shift_handover audit trail
CREATE OR REPLACE FUNCTION public.complete_shift_handover(p_handover_id uuid, p_incoming_user_id uuid, p_accept boolean, p_notes text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_handover RECORD;
  v_order RECORD;
BEGIN
  IF NOT has_terminal_access(p_incoming_user_id) THEN
    RAISE EXCEPTION 'User does not have terminal access';
  END IF;

  SELECT * INTO v_handover
  FROM terminal_shift_handovers
  WHERE id = p_handover_id AND incoming_user_id = p_incoming_user_id AND status = 'pending';

  IF v_handover IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Handover not found or not pending');
  END IF;

  IF p_accept THEN
    FOR v_order IN SELECT * FROM jsonb_array_elements(v_handover.handover_orders) AS o LOOP
      PERFORM assign_terminal_order(
        p_order_number := v_order.value->>'order_number',
        p_assigned_to := p_incoming_user_id,
        p_assigned_by := p_incoming_user_id,
        p_assignment_type := 'handover',
        p_trade_type := v_order.value->>'trade_type',
        p_total_price := (v_order.value->>'total_price')::numeric,
        p_asset := NULL
      );
    END LOOP;

    UPDATE terminal_shift_handovers
    SET status = 'completed', incoming_notes = p_notes, completed_at = now()
    WHERE id = p_handover_id;

    INSERT INTO terminal_notifications (user_id, notification_type, title, message, metadata)
    VALUES (v_handover.outgoing_user_id, 'handover', 'Handover Accepted',
      'Your shift handover has been accepted',
      jsonb_build_object('handover_id', p_handover_id));
  ELSE
    UPDATE terminal_shift_handovers
    SET status = 'rejected', incoming_notes = p_notes, completed_at = now()
    WHERE id = p_handover_id;

    INSERT INTO terminal_notifications (user_id, notification_type, title, message, metadata)
    VALUES (v_handover.outgoing_user_id, 'handover', 'Handover Rejected',
      COALESCE(p_notes, 'Your shift handover was rejected'),
      jsonb_build_object('handover_id', p_handover_id));
  END IF;

  RETURN jsonb_build_object('status', CASE WHEN p_accept THEN 'completed' ELSE 'rejected' END);
END;
$$;

-- Re-apply BUG-03 + BUG-05: initiate_shift_handover (4-arg) standardize + duplicate prevention
CREATE OR REPLACE FUNCTION public.initiate_shift_handover(p_outgoing_user_id uuid, p_incoming_user_id uuid, p_orders jsonb, p_notes text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_handover_id uuid;
BEGIN
  IF NOT has_terminal_access(p_outgoing_user_id) THEN
    RAISE EXCEPTION 'Outgoing user does not have terminal access';
  END IF;
  IF NOT has_terminal_access(p_incoming_user_id) THEN
    RAISE EXCEPTION 'Incoming user does not have terminal access';
  END IF;

  IF EXISTS (SELECT 1 FROM terminal_shift_handovers WHERE outgoing_user_id = p_outgoing_user_id AND status = 'pending') THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'You already have a pending handover. Complete or cancel it first.');
  END IF;

  INSERT INTO terminal_shift_handovers (outgoing_user_id, incoming_user_id, handover_orders, outgoing_notes)
  VALUES (p_outgoing_user_id, p_incoming_user_id, p_orders, p_notes)
  RETURNING id INTO v_handover_id;

  INSERT INTO terminal_notifications (user_id, notification_type, title, message, metadata)
  VALUES (p_incoming_user_id, 'handover', 'Shift Handover Request',
    'You have a pending shift handover with ' || jsonb_array_length(p_orders) || ' orders.',
    jsonb_build_object('handover_id', v_handover_id));

  RETURN jsonb_build_object('status', 'success', 'handover_id', v_handover_id);
END;
$$;

-- Re-apply BUG-03 + BUG-05: initiate_shift_handover (3-arg)
CREATE OR REPLACE FUNCTION public.initiate_shift_handover(p_outgoing_user_id uuid, p_incoming_user_id uuid, p_notes text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

  IF EXISTS (SELECT 1 FROM terminal_shift_handovers WHERE outgoing_user_id = p_outgoing_user_id AND status = 'pending') THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'You already have a pending handover. Complete or cancel it first.');
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

-- Re-apply BUG-04 + BUG-10: escalate_terminal_order
CREATE OR REPLACE FUNCTION public.escalate_terminal_order(p_order_number text, p_escalated_by uuid, p_reason text, p_priority text DEFAULT 'medium')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_escalated_to uuid;
  v_escalation_id uuid;
BEGIN
  IF NOT has_terminal_access(p_escalated_by) THEN
    RAISE EXCEPTION 'User does not have terminal access';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM p2p_order_records WHERE binance_order_number = p_order_number) THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Order not found');
  END IF;

  IF EXISTS (SELECT 1 FROM terminal_order_escalations WHERE order_number = p_order_number AND status = 'open') THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'An open escalation already exists for this order');
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

-- Re-apply BUG-07 + BUG-09: payer functions
CREATE OR REPLACE FUNCTION public.lock_payer_order(p_order_number text, p_payer_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_lock_id uuid;
BEGIN
  IF NOT has_terminal_access(p_payer_user_id) THEN
    RAISE EXCEPTION 'User does not have terminal access';
  END IF;

  IF EXISTS (SELECT 1 FROM terminal_payer_order_locks WHERE order_number = p_order_number AND status IN ('paid', 'completed')) THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Order already paid or completed');
  END IF;

  INSERT INTO terminal_payer_order_locks (order_number, payer_user_id, status)
  VALUES (p_order_number, p_payer_user_id, 'locked')
  RETURNING id INTO v_lock_id;

  INSERT INTO terminal_activity_log (user_id, activity_type, metadata)
  VALUES (p_payer_user_id, 'payer_lock', jsonb_build_object('order_number', p_order_number, 'lock_id', v_lock_id));

  INSERT INTO terminal_payer_order_log (order_number, payer_id, action)
  VALUES (p_order_number, p_payer_user_id, 'locked');

  RETURN jsonb_build_object('status', 'locked', 'lock_id', v_lock_id);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('status', 'already_locked', 'message', 'Order is already locked by another payer');
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_payer_order_paid(p_order_number text, p_payer_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

  INSERT INTO terminal_payer_order_log (order_number, payer_id, action)
  VALUES (p_order_number, p_payer_user_id, 'marked_paid');

  RETURN jsonb_build_object('status', 'paid');
END;
$$;

CREATE OR REPLACE FUNCTION public.release_payer_order_lock(p_order_number text, p_payer_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

  INSERT INTO terminal_payer_order_log (order_number, payer_id, action)
  VALUES (p_order_number, p_payer_user_id, 'released');

  RETURN jsonb_build_object('status', 'released');
END;
$$;

-- Re-apply BUG-11: SLA fires on completed orders
CREATE OR REPLACE FUNCTION public.check_terminal_order_sla()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
    JOIN p2p_order_records por ON por.binance_order_number = toa.order_number
      AND por.order_status NOT ILIKE '%COMPLETED%'
      AND por.order_status NOT ILIKE '%CANCELLED%'
      AND por.order_status NOT ILIKE '%EXPIRED%'
    WHERE toa.is_active = true
      AND toa.created_at < now() - interval '10 minutes'
      AND NOT EXISTS (
        SELECT 1 FROM terminal_notifications tn
        WHERE tn.metadata->>'order_number' = toa.order_number
          AND tn.notification_type = 'sla_warning'
          AND tn.created_at > now() - interval '15 minutes'
      )
  LOOP
    INSERT INTO terminal_notifications (user_id, notification_type, title, message, metadata)
    VALUES (v_assignment.assigned_to, 'sla_warning',
      'SLA Warning: Order ' || v_assignment.order_number,
      'Order has been assigned for ' || round(v_assignment.age_minutes) || ' minutes without completion.',
      jsonb_build_object('order_number', v_assignment.order_number, 'age_minutes', round(v_assignment.age_minutes)));

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

-- Re-apply BUG-12: permission change log + save_terminal_role session var
CREATE OR REPLACE FUNCTION public.log_terminal_permission_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role_name text;
  v_action text;
  v_permission text;
  v_changed_by uuid;
BEGIN
  BEGIN
    v_changed_by := current_setting('app.current_user_id', true)::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_changed_by := NULL;
  END;
  IF v_changed_by IS NULL THEN
    v_changed_by := auth.uid();
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_action := 'grant';
    v_permission := NEW.permission::text;
    SELECT name INTO v_role_name FROM public.p2p_terminal_roles WHERE id = NEW.role_id;
    INSERT INTO public.terminal_permission_change_log (role_id, role_name, permission, action, changed_by)
    VALUES (NEW.role_id, COALESCE(v_role_name, 'unknown'), v_permission, v_action, v_changed_by);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'revoke';
    v_permission := OLD.permission::text;
    SELECT name INTO v_role_name FROM public.p2p_terminal_roles WHERE id = OLD.role_id;
    INSERT INTO public.terminal_permission_change_log (role_id, role_name, permission, action, changed_by)
    VALUES (OLD.role_id, COALESCE(v_role_name, 'unknown'), v_permission, v_action, v_changed_by);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_terminal_role(
  p_role_id uuid DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_hierarchy_level integer DEFAULT NULL,
  p_permissions text[] DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role_id UUID;
  v_caller_id UUID;
  v_caller_level INT;
  v_caller_perms TEXT[];
  v_target_level INT;
  v_new_level INT;
  v_illegal_perms TEXT[];
  v_is_erp_super_admin BOOLEAN;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM set_config('app.current_user_id', v_caller_id::text, true);

  SELECT public.has_role(v_caller_id, 'Super Admin') INTO v_is_erp_super_admin;

  SELECT COALESCE(MIN(r.hierarchy_level), 999)
  INTO v_caller_level
  FROM p2p_terminal_user_roles tur
  JOIN p2p_terminal_roles r ON r.id = tur.role_id
  WHERE tur.user_id = v_caller_id;

  IF v_caller_level > 0 AND NOT v_is_erp_super_admin THEN
    IF NOT EXISTS (
      SELECT 1 FROM p2p_terminal_user_roles tur
      JOIN p2p_terminal_role_permissions rp ON rp.role_id = tur.role_id
      WHERE tur.user_id = v_caller_id AND rp.permission = 'terminal_users_role_assign'
    ) THEN
      RAISE EXCEPTION 'You do not have permission to manage roles (terminal_users_role_assign required)';
    END IF;

    v_target_level := COALESCE(p_hierarchy_level, 999);
    IF p_role_id IS NOT NULL THEN
      SELECT hierarchy_level INTO v_target_level FROM p2p_terminal_roles WHERE id = p_role_id;
      v_target_level := COALESCE(v_target_level, 999);
    END IF;
    IF v_target_level <= v_caller_level THEN
      RAISE EXCEPTION 'Cannot edit roles at or above your hierarchy level (%)' , v_caller_level;
    END IF;

    v_new_level := COALESCE(p_hierarchy_level, v_target_level);
    IF v_new_level <= v_caller_level THEN
      RAISE EXCEPTION 'Cannot set a role hierarchy level at or above your own level (%)' , v_caller_level;
    END IF;

    SELECT array_agg(DISTINCT rp.permission::text)
    INTO v_caller_perms
    FROM p2p_terminal_user_roles tur
    JOIN p2p_terminal_role_permissions rp ON rp.role_id = tur.role_id
    WHERE tur.user_id = v_caller_id;

    SELECT array_agg(p)
    INTO v_illegal_perms
    FROM unnest(p_permissions) p
    WHERE p NOT IN (SELECT unnest(COALESCE(v_caller_perms, '{}')));

    IF v_illegal_perms IS NOT NULL AND array_length(v_illegal_perms, 1) > 0 THEN
      RAISE EXCEPTION 'Cannot grant permissions you do not have: %', array_to_string(v_illegal_perms, ', ');
    END IF;
  END IF;

  IF p_role_id IS NOT NULL THEN
    UPDATE p2p_terminal_roles
    SET name = p_name, description = p_description,
        hierarchy_level = COALESCE(p_hierarchy_level, hierarchy_level),
        updated_at = now()
    WHERE id = p_role_id;
    v_role_id := p_role_id;
    DELETE FROM p2p_terminal_role_permissions WHERE role_id = v_role_id;
  ELSE
    INSERT INTO p2p_terminal_roles (name, description, hierarchy_level)
    VALUES (p_name, p_description, p_hierarchy_level)
    RETURNING id INTO v_role_id;
  END IF;

  INSERT INTO p2p_terminal_role_permissions (role_id, permission)
  SELECT v_role_id, unnest(p_permissions)::terminal_permission;

  RETURN v_role_id;
END;
$$;
