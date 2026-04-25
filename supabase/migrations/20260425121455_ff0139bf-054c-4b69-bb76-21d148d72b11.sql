UPDATE public.customer_support_tickets
SET escalated = true,
    status = 'in_progress'
WHERE status = 'escalated';

ALTER TABLE public.customer_support_tickets
DROP CONSTRAINT IF EXISTS customer_support_tickets_status_check;

ALTER TABLE public.customer_support_tickets
ADD CONSTRAINT customer_support_tickets_status_check
CHECK (status IN ('open', 'in_progress', 'pending_customer', 'resolved', 'closed'));

CREATE OR REPLACE FUNCTION public.enforce_customer_support_ticket_status_workflow()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NOT (
       (OLD.status = 'open' AND NEW.status = 'in_progress')
       OR (OLD.status = 'in_progress' AND NEW.status = 'pending_customer')
       OR (OLD.status = 'pending_customer' AND NEW.status = 'resolved')
       OR (OLD.status = 'resolved' AND NEW.status = 'closed')
     ) THEN
    RAISE EXCEPTION 'Invalid ticket status transition: % to %. Use the defined workflow order.', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_customer_support_ticket_status_workflow ON public.customer_support_tickets;
CREATE TRIGGER trg_enforce_customer_support_ticket_status_workflow
BEFORE UPDATE OF status ON public.customer_support_tickets
FOR EACH ROW
EXECUTE FUNCTION public.enforce_customer_support_ticket_status_workflow();