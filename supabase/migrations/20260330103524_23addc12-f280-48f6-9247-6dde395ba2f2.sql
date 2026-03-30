
-- T-BUG-07: Fix re_escalate_terminal_order non-deterministic fallback (preserve default)
CREATE OR REPLACE FUNCTION public.re_escalate_terminal_order(p_escalation_id uuid, p_current_handler_id uuid, p_reason text DEFAULT 'Re-escalated to higher level')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order_number text;
  v_next_supervisor uuid;
  v_new_escalation_id uuid;
BEGIN
  IF NOT has_terminal_access(p_current_handler_id) THEN
    RAISE EXCEPTION 'User does not have terminal access';
  END IF;

  SELECT order_number INTO v_order_number
  FROM terminal_order_escalations
  WHERE id = p_escalation_id AND escalated_to = p_current_handler_id AND status = 'open';

  IF v_order_number IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Escalation not found or not assigned to you');
  END IF;

  SELECT reports_to INTO v_next_supervisor
  FROM terminal_user_profiles WHERE user_id = p_current_handler_id;

  IF v_next_supervisor IS NULL THEN
    SELECT ur.user_id INTO v_next_supervisor
    FROM p2p_terminal_user_roles ur
    JOIN p2p_terminal_roles r ON r.id = ur.role_id
    WHERE r.hierarchy_level <= 0 AND ur.user_id != p_current_handler_id
    ORDER BY r.hierarchy_level ASC, ur.assigned_at ASC
    LIMIT 1;
  END IF;

  IF v_next_supervisor IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'No higher-level supervisor found');
  END IF;

  UPDATE terminal_order_escalations
  SET status = 'reassigned', resolution_note = 'Re-escalated: ' || p_reason, resolved_by = p_current_handler_id, resolved_at = now()
  WHERE id = p_escalation_id;

  INSERT INTO terminal_order_escalations (order_number, escalated_by, escalated_to, reason, priority, status)
  VALUES (v_order_number, p_current_handler_id, v_next_supervisor, p_reason, 'high', 'open')
  RETURNING id INTO v_new_escalation_id;

  INSERT INTO terminal_notifications (user_id, notification_type, title, message, metadata)
  VALUES (v_next_supervisor, 'escalation', 'Re-escalated: ' || v_order_number,
    p_reason, jsonb_build_object('order_number', v_order_number, 'escalation_id', v_new_escalation_id, 'priority', 'high', 're_escalated', true));

  RETURN jsonb_build_object('status', 'success', 'new_escalation_id', v_new_escalation_id, 'escalated_to', v_next_supervisor);
END;
$$;

-- T-BUG-08: extend_terminal_biometric_session return type mismatch
CREATE OR REPLACE FUNCTION public.extend_terminal_biometric_session(p_user_id uuid, p_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row_count integer;
BEGIN
  UPDATE public.terminal_biometric_sessions
  SET expires_at = now() + interval '12 minutes',
      extend_count = extend_count + 1
  WHERE user_id = p_user_id
    AND session_token = p_token
    AND is_active = true
    AND expires_at > now()
    AND max_expires_at > now()
    AND extend_count < 20;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  RETURN v_row_count > 0;
END;
$$;

-- T-BUG-09: SLA check for stale payer locks
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

  -- Check stale payer locks
  FOR v_assignment IN
    SELECT pol.order_number, pol.payer_user_id AS assigned_to, pol.created_at,
           EXTRACT(EPOCH FROM (now() - pol.created_at)) / 60.0 AS age_minutes
    FROM terminal_payer_order_locks pol
    JOIN p2p_order_records por ON por.binance_order_number = pol.order_number
      AND por.order_status NOT ILIKE '%COMPLETED%'
      AND por.order_status NOT ILIKE '%CANCELLED%'
      AND por.order_status NOT ILIKE '%EXPIRED%'
    WHERE pol.status = 'locked'
      AND pol.created_at < now() - interval '10 minutes'
      AND NOT EXISTS (
        SELECT 1 FROM terminal_notifications tn
        WHERE tn.metadata->>'order_number' = pol.order_number
          AND tn.notification_type = 'sla_warning'
          AND tn.created_at > now() - interval '15 minutes'
      )
  LOOP
    INSERT INTO terminal_notifications (user_id, notification_type, title, message, metadata)
    VALUES (v_assignment.assigned_to, 'sla_warning',
      'SLA Warning: Payer Lock ' || v_assignment.order_number,
      'Order has been locked for payment for ' || round(v_assignment.age_minutes) || ' minutes.',
      jsonb_build_object('order_number', v_assignment.order_number, 'age_minutes', round(v_assignment.age_minutes), 'lock_type', 'payer'));

    SELECT reports_to INTO v_supervisor_id FROM terminal_user_profiles WHERE user_id = v_assignment.assigned_to;
    IF v_supervisor_id IS NOT NULL THEN
      INSERT INTO terminal_notifications (user_id, notification_type, title, message, metadata)
      VALUES (v_supervisor_id, 'sla_warning',
        'SLA Warning: Payer Lock ' || v_assignment.order_number || ' (subordinate)',
        'Payer has not completed payment in ' || round(v_assignment.age_minutes) || ' minutes.',
        jsonb_build_object('order_number', v_assignment.order_number, 'assigned_to', v_assignment.assigned_to, 'lock_type', 'payer'));
    END IF;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- T-BUG-11: revoke_terminal_biometric_session no permission check
CREATE OR REPLACE FUNCTION public.revoke_terminal_biometric_session(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_user_id != auth.uid()
     AND NOT public.has_role(auth.uid(), 'Super Admin')
     AND NOT EXISTS (
       SELECT 1 FROM p2p_terminal_user_roles tur
       JOIN p2p_terminal_roles r ON r.id = tur.role_id
       WHERE tur.user_id = auth.uid() AND r.hierarchy_level <= 0
     ) THEN
    RAISE EXCEPTION 'Permission denied: can only revoke own session or must be admin';
  END IF;

  UPDATE public.terminal_biometric_sessions
  SET is_active = false
  WHERE user_id = p_user_id AND is_active = true;
END;
$function$;

-- T-BUG-12: mark_payer_order_paid no order status validation
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

  IF EXISTS (
    SELECT 1 FROM p2p_order_records
    WHERE binance_order_number = p_order_number
    AND order_status ILIKE ANY(ARRAY['%CANCELLED%', '%EXPIRED%'])
  ) THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Order is already cancelled or expired');
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
