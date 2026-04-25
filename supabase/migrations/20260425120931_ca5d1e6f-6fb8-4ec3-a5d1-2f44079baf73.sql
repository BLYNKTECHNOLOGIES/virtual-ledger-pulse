CREATE OR REPLACE FUNCTION public.prevent_direct_customer_support_reassignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.customer_support_transfer', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.assigned_to IS NOT NULL
     AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    RAISE EXCEPTION 'Ticket reassignment must use the support ticket transfer workflow';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_customer_support_ticket(
  p_ticket_id UUID,
  p_to_user_id UUID,
  p_transfer_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from_user_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT assigned_to
  INTO v_from_user_id
  FROM public.customer_support_tickets
  WHERE id = p_ticket_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Support ticket not found';
  END IF;

  IF v_from_user_id IS NULL THEN
    RAISE EXCEPTION 'Ticket must be assigned first before it can be transferred';
  END IF;

  IF v_from_user_id = p_to_user_id THEN
    RAISE EXCEPTION 'Ticket is already assigned to this user';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = p_to_user_id
      AND status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Target assignee is not an active ERP user';
  END IF;

  IF v_from_user_id <> auth.uid()
     AND NOT public.can_manage_customer_support_tickets(auth.uid()) THEN
    RAISE EXCEPTION 'Only the current assignee or support managers can transfer this ticket';
  END IF;

  PERFORM set_config('app.customer_support_transfer', 'on', true);

  UPDATE public.customer_support_tickets
  SET assigned_to = p_to_user_id
  WHERE id = p_ticket_id;

  PERFORM set_config('app.customer_support_transfer', 'off', true);

  INSERT INTO public.customer_support_ticket_transfers (
    ticket_id,
    from_user_id,
    to_user_id,
    transferred_by,
    transfer_reason
  ) VALUES (
    p_ticket_id,
    v_from_user_id,
    p_to_user_id,
    auth.uid(),
    p_transfer_reason
  );
EXCEPTION
  WHEN OTHERS THEN
    PERFORM set_config('app.customer_support_transfer', 'off', true);
    RAISE;
END;
$$;