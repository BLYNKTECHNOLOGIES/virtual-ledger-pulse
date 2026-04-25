UPDATE public.customer_support_tickets
SET escalated = false
WHERE status = 'closed' AND escalated = true;

CREATE OR REPLACE FUNCTION public.set_customer_support_ticket_audit_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.order_number := upper(trim(NEW.order_number));
  NEW.customer_issue := trim(NEW.customer_issue);
  NEW.escalation_reason := nullif(trim(coalesce(NEW.escalation_reason, '')), '');
  NEW.resolution_notes := nullif(trim(coalesce(NEW.resolution_notes, '')), '');
  NEW.updated_at := now();

  IF NEW.status IN ('resolved', 'closed') AND NEW.resolved_at IS NULL THEN
    NEW.resolved_at := now();
  END IF;

  IF NEW.status NOT IN ('resolved', 'closed') THEN
    NEW.resolved_at := NULL;
  END IF;

  IF NEW.status = 'closed' THEN
    NEW.escalated := false;
  END IF;

  RETURN NEW;
END;
$$;