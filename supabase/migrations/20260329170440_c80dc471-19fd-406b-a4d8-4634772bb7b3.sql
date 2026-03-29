
-- Fix unguarded initiate_shift_handover overload (with p_orders)
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
  IF NOT has_terminal_access(p_outgoing_user_id) THEN
    RAISE EXCEPTION 'Outgoing user does not have terminal access';
  END IF;
  IF NOT has_terminal_access(p_incoming_user_id) THEN
    RAISE EXCEPTION 'Incoming user does not have terminal access';
  END IF;

  INSERT INTO terminal_shift_handovers (outgoing_user_id, incoming_user_id, handover_orders, outgoing_notes)
  VALUES (p_outgoing_user_id, p_incoming_user_id, p_orders, p_notes)
  RETURNING id INTO v_handover_id;

  INSERT INTO terminal_notifications (user_id, notification_type, title, message, metadata)
  VALUES (p_incoming_user_id, 'shift_handover', 'Shift Handover Request',
    'You have a pending shift handover with ' || jsonb_array_length(p_orders) || ' orders.',
    jsonb_build_object('handover_id', v_handover_id));

  RETURN jsonb_build_object('status', 'success', 'handover_id', v_handover_id);
END;
$$;

-- Fix unguarded complete_shift_handover
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
    -- Reassign all orders from outgoing to incoming
    FOR v_order IN SELECT * FROM jsonb_array_elements(v_handover.handover_orders) AS o LOOP
      UPDATE terminal_order_assignments
      SET assigned_to = p_incoming_user_id, updated_at = now()
      WHERE order_number = v_order.value->>'order_number' AND is_active = true;
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
