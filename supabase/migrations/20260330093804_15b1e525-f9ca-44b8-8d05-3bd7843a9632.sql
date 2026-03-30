-- BUG 3: Add SET search_path to biometric session functions

CREATE OR REPLACE FUNCTION public.extend_terminal_biometric_session(p_user_id uuid, p_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_updated boolean;
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

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$function$;

CREATE OR REPLACE FUNCTION public.revoke_terminal_biometric_session(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.terminal_biometric_sessions
  SET is_active = false
  WHERE user_id = p_user_id AND is_active = true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_terminal_biometric_session(p_user_id uuid, p_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_valid boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM public.terminal_biometric_sessions
    WHERE user_id = p_user_id
      AND session_token = p_token
      AND is_active = true
      AND expires_at > now()
      AND (max_expires_at IS NULL OR max_expires_at > now())
  ) INTO v_valid;
  RETURN v_valid;
END;
$function$;

-- BUG 4: Add permission guard to resolve_terminal_escalation
CREATE OR REPLACE FUNCTION public.resolve_terminal_escalation(p_escalation_id uuid, p_resolved_by uuid, p_resolution_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Permission guard
  IF NOT public.has_terminal_access(p_resolved_by)
     AND NOT public.has_role(p_resolved_by, 'Super Admin') THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Access denied');
  END IF;

  IF NOT public.has_terminal_permission(p_resolved_by, 'terminal_orders_resolve_escalation')
     AND NOT public.has_role(p_resolved_by, 'Super Admin') THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Permission denied: terminal_orders_resolve_escalation required');
  END IF;

  UPDATE terminal_order_escalations
  SET status = 'resolved', resolved_by = p_resolved_by, resolution_note = p_resolution_note, resolved_at = now()
  WHERE id = p_escalation_id AND status IN ('open', 'acknowledged');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Escalation not found or already resolved');
  END IF;

  RETURN jsonb_build_object('status', 'success');
END;
$function$;

-- BUG 5: Add permission guard to assign_terminal_order
CREATE OR REPLACE FUNCTION public.assign_terminal_order(p_order_number text, p_assigned_to uuid, p_assigned_by uuid, p_assignment_type text DEFAULT 'manual'::text, p_trade_type text DEFAULT NULL::text, p_total_price numeric DEFAULT 0, p_asset text DEFAULT 'USDT'::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_old_assignee uuid;
BEGIN
  -- Permission guard
  IF NOT public.has_terminal_permission(p_assigned_by, 'terminal_orders_manage')
     AND NOT public.has_role(p_assigned_by, 'Super Admin') THEN
    RAISE EXCEPTION 'Permission denied: terminal_orders_manage required';
  END IF;

  SELECT assigned_to INTO v_old_assignee
  FROM terminal_order_assignments
  WHERE order_number = p_order_number AND is_active = true;

  IF v_old_assignee IS NOT NULL THEN
    UPDATE terminal_order_assignments
    SET is_active = false, updated_at = now()
    WHERE order_number = p_order_number AND is_active = true;
  END IF;

  INSERT INTO terminal_order_assignments (
    order_number, assigned_to, assigned_by, assignment_type,
    trade_type, total_price, asset
  ) VALUES (
    p_order_number, p_assigned_to, p_assigned_by, p_assignment_type,
    p_trade_type, p_total_price, p_asset
  ) RETURNING id INTO v_id;

  INSERT INTO terminal_assignment_audit_logs (
    action_type, target_user_id, performed_by,
    previous_value, new_value, order_reference
  ) VALUES (
    CASE WHEN v_old_assignee IS NOT NULL THEN 'reassigned' ELSE 'assigned' END,
    p_assigned_to,
    p_assigned_by,
    CASE WHEN v_old_assignee IS NOT NULL THEN jsonb_build_object('assignee', v_old_assignee) ELSE NULL END,
    jsonb_build_object('assignee', p_assigned_to, 'type', p_assignment_type),
    p_order_number
  );

  RETURN v_id;
END;
$function$;

-- BUG 5: Add permission guard to unassign_terminal_order
CREATE OR REPLACE FUNCTION public.unassign_terminal_order(p_order_number text, p_performed_by uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old_assignee uuid;
BEGIN
  -- Permission guard
  IF NOT public.has_terminal_permission(p_performed_by, 'terminal_orders_manage')
     AND NOT public.has_role(p_performed_by, 'Super Admin') THEN
    RAISE EXCEPTION 'Permission denied: terminal_orders_manage required';
  END IF;

  SELECT assigned_to INTO v_old_assignee
  FROM terminal_order_assignments
  WHERE order_number = p_order_number AND is_active = true;

  IF v_old_assignee IS NULL THEN
    RETURN;
  END IF;

  UPDATE terminal_order_assignments
  SET is_active = false, updated_at = now()
  WHERE order_number = p_order_number AND is_active = true;

  INSERT INTO terminal_assignment_audit_logs (
    action_type, target_user_id, performed_by,
    previous_value, order_reference
  ) VALUES (
    'unassigned',
    v_old_assignee,
    p_performed_by,
    jsonb_build_object('assignee', v_old_assignee),
    p_order_number
  );
END;
$function$;