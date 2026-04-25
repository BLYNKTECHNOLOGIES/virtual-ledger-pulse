CREATE TABLE IF NOT EXISTS public.customer_support_ticket_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.customer_support_tickets(id) ON DELETE CASCADE,
  from_user_id UUID NULL,
  to_user_id UUID NOT NULL,
  transferred_by UUID NOT NULL,
  transfer_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT customer_support_ticket_transfers_reason_len CHECK (transfer_reason IS NULL OR char_length(trim(transfer_reason)) <= 1000)
);

CREATE INDEX IF NOT EXISTS idx_customer_support_ticket_transfers_ticket_id_created_at
ON public.customer_support_ticket_transfers (ticket_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_support_ticket_transfers_to_user_id
ON public.customer_support_ticket_transfers (to_user_id);

ALTER TABLE public.customer_support_ticket_transfers ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_customer_support_ticket_transfer_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.transfer_reason := nullif(trim(coalesce(NEW.transfer_reason, '')), '');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customer_support_ticket_transfer_fields ON public.customer_support_ticket_transfers;
CREATE TRIGGER trg_customer_support_ticket_transfer_fields
BEFORE INSERT OR UPDATE ON public.customer_support_ticket_transfers
FOR EACH ROW
EXECUTE FUNCTION public.set_customer_support_ticket_transfer_fields();

CREATE OR REPLACE FUNCTION public.prevent_direct_customer_support_reassignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF pg_trigger_depth() = 1
     AND TG_OP = 'UPDATE'
     AND OLD.assigned_to IS NOT NULL
     AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    RAISE EXCEPTION 'Ticket reassignment must use the support ticket transfer workflow';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_direct_customer_support_reassignment ON public.customer_support_tickets;
CREATE TRIGGER trg_prevent_direct_customer_support_reassignment
BEFORE UPDATE OF assigned_to ON public.customer_support_tickets
FOR EACH ROW
EXECUTE FUNCTION public.prevent_direct_customer_support_reassignment();

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

  UPDATE public.customer_support_tickets
  SET assigned_to = p_to_user_id
  WHERE id = p_ticket_id;

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
END;
$$;

DROP POLICY IF EXISTS "Support users can view ticket transfer history" ON public.customer_support_ticket_transfers;
CREATE POLICY "Support users can view ticket transfer history"
ON public.customer_support_ticket_transfers
FOR SELECT
TO authenticated
USING (
  transferred_by = auth.uid()
  OR from_user_id = auth.uid()
  OR to_user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.customer_support_tickets cst
    WHERE cst.id = ticket_id
      AND (
        cst.created_by = auth.uid()
        OR cst.assigned_to = auth.uid()
        OR public.can_manage_customer_support_tickets(auth.uid())
      )
  )
);

DROP POLICY IF EXISTS "Support workflow can create transfer history" ON public.customer_support_ticket_transfers;
CREATE POLICY "Support workflow can create transfer history"
ON public.customer_support_ticket_transfers
FOR INSERT
TO authenticated
WITH CHECK (transferred_by = auth.uid());