
-- T-BUG-03 (CRITICAL): admin_reset_user_password has ZERO permission check
CREATE OR REPLACE FUNCTION public.admin_reset_user_password(p_user_id uuid, p_new_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    -- Permission gate: only Super Admin or Admin can reset passwords
    IF NOT public.has_role(auth.uid(), 'Super Admin')
       AND NOT public.has_role(auth.uid(), 'Admin') THEN
      RAISE EXCEPTION 'Permission denied: Admin or Super Admin required';
    END IF;

    UPDATE users
    SET password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
        force_logout_at = now(),
        updated_at = now()
    WHERE id = p_user_id;
    RETURN FOUND;
END;
$function$;

-- T-BUG-06: create_terminal_biometric_session has no terminal access check
CREATE OR REPLACE FUNCTION public.create_terminal_biometric_session(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_token text;
BEGIN
  -- Permission gate
  IF NOT public.has_terminal_access(p_user_id) THEN
    RAISE EXCEPTION 'User does not have terminal access';
  END IF;

  UPDATE public.terminal_biometric_sessions
  SET is_active = false
  WHERE user_id = p_user_id AND is_active = true;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  INSERT INTO public.terminal_biometric_sessions (user_id, session_token)
  VALUES (p_user_id, v_token);

  INSERT INTO public.terminal_activity_log (user_id, activity_type, metadata)
  VALUES (p_user_id, 'login_biometric', '{}');

  RETURN v_token;
END;
$function$;

-- T-BUG-02: generate_terminal_bypass_code — add retry logic + used code cleanup
CREATE OR REPLACE FUNCTION public.generate_terminal_bypass_code(p_user_id uuid, p_generated_by uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_code text;
  v_recent_count integer;
  v_attempts integer := 0;
BEGIN
  IF NOT public.has_role(p_generated_by, 'Super Admin')
     AND NOT EXISTS (
       SELECT 1 FROM p2p_terminal_user_roles tur
       JOIN p2p_terminal_roles r ON r.id = tur.role_id
       WHERE tur.user_id = p_generated_by AND r.hierarchy_level <= 0
     )
     AND NOT public.has_terminal_permission(p_generated_by, 'terminal_users_bypass_code') THEN
    RAISE EXCEPTION 'Permission denied: terminal_users_bypass_code required';
  END IF;

  SELECT COUNT(*) INTO v_recent_count
  FROM terminal_bypass_codes
  WHERE user_id = p_user_id AND created_at > now() - interval '15 minutes';

  IF v_recent_count >= 3 THEN
    RAISE EXCEPTION 'Rate limit exceeded. Maximum 3 bypass codes per 15 minutes.';
  END IF;

  -- Clean up old used codes to free code space
  DELETE FROM terminal_bypass_codes WHERE is_used = true AND created_at < now() - interval '24 hours';

  -- Retry loop for unique constraint collisions
  LOOP
    v_code := lpad(floor(random() * 1000000)::text, 6, '0');
    v_attempts := v_attempts + 1;

    BEGIN
      UPDATE public.terminal_bypass_codes
      SET is_used = true
      WHERE user_id = p_user_id AND is_used = false;

      INSERT INTO public.terminal_bypass_codes (user_id, code, generated_by)
      VALUES (p_user_id, v_code, p_generated_by);

      INSERT INTO terminal_activity_log (user_id, activity_type, metadata)
      VALUES (p_generated_by, 'bypass_code_generated', jsonb_build_object('target_user_id', p_user_id));

      RETURN v_code;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempts >= 5 THEN
        RAISE EXCEPTION 'Failed to generate unique bypass code after 5 attempts';
      END IF;
    END;
  END LOOP;
END;
$$;

-- T-BUG-07: escalate_terminal_order fallback — add ORDER BY before LIMIT
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
    WHERE r.hierarchy_level <= 0
    ORDER BY r.hierarchy_level ASC, ur.assigned_at ASC
    LIMIT 1;
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
