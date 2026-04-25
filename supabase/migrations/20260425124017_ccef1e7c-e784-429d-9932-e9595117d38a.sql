CREATE OR REPLACE FUNCTION public.prevent_closed_support_ticket_assignment_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.status = 'closed'
     AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    RAISE EXCEPTION 'Closed support tickets cannot be reassigned';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_closed_support_ticket_assignment_change ON public.customer_support_tickets;
CREATE TRIGGER trg_prevent_closed_support_ticket_assignment_change
BEFORE UPDATE ON public.customer_support_tickets
FOR EACH ROW
EXECUTE FUNCTION public.prevent_closed_support_ticket_assignment_change();

DROP TRIGGER IF EXISTS trg_set_customer_support_ticket_audit_fields ON public.customer_support_tickets;
CREATE TRIGGER trg_set_customer_support_ticket_audit_fields
BEFORE INSERT OR UPDATE ON public.customer_support_tickets
FOR EACH ROW
EXECUTE FUNCTION public.set_customer_support_ticket_audit_fields();

CREATE OR REPLACE FUNCTION public.transfer_customer_support_ticket(p_ticket_id uuid, p_to_user_id uuid, p_transfer_reason text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_from_user_id UUID;
  v_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT assigned_to, status
  INTO v_from_user_id, v_status
  FROM public.customer_support_tickets
  WHERE id = p_ticket_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Support ticket not found';
  END IF;

  IF v_status = 'closed' THEN
    RAISE EXCEPTION 'Closed support tickets cannot be transferred';
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