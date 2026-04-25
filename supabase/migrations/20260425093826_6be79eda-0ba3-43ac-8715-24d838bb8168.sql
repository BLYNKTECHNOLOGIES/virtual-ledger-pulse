CREATE TABLE IF NOT EXISTS public.customer_support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL,
  customer_issue TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'medium',
  assigned_to UUID NULL,
  created_by UUID NOT NULL,
  escalated BOOLEAN NOT NULL DEFAULT false,
  escalation_reason TEXT NULL,
  resolution_notes TEXT NULL,
  resolved_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT customer_support_tickets_status_check CHECK (status IN ('open', 'in_progress', 'pending_customer', 'escalated', 'resolved', 'closed')),
  CONSTRAINT customer_support_tickets_priority_check CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  CONSTRAINT customer_support_tickets_order_number_len CHECK (char_length(trim(order_number)) BETWEEN 3 AND 80),
  CONSTRAINT customer_support_tickets_issue_len CHECK (char_length(trim(customer_issue)) BETWEEN 5 AND 2000),
  CONSTRAINT customer_support_tickets_escalation_len CHECK (escalation_reason IS NULL OR char_length(trim(escalation_reason)) <= 1000),
  CONSTRAINT customer_support_tickets_resolution_len CHECK (resolution_notes IS NULL OR char_length(trim(resolution_notes)) <= 2000)
);

CREATE INDEX IF NOT EXISTS idx_customer_support_tickets_order_number ON public.customer_support_tickets (order_number);
CREATE INDEX IF NOT EXISTS idx_customer_support_tickets_status_priority ON public.customer_support_tickets (status, priority);
CREATE INDEX IF NOT EXISTS idx_customer_support_tickets_assigned_to ON public.customer_support_tickets (assigned_to);
CREATE INDEX IF NOT EXISTS idx_customer_support_tickets_created_by ON public.customer_support_tickets (created_by);
CREATE INDEX IF NOT EXISTS idx_customer_support_tickets_created_at ON public.customer_support_tickets (created_at DESC);

ALTER TABLE public.customer_support_tickets ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_manage_customer_support_tickets(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.p2p_terminal_user_roles tur
    JOIN public.p2p_terminal_role_permissions trp ON trp.role_id = tur.role_id
    WHERE tur.user_id = _user_id
      AND trp.permission IN ('terminal_orders_escalate', 'terminal_orders_manage', 'terminal_users_manage')
  )
  OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = _user_id
      AND lower(r.name) IN ('super admin', 'admin')
  );
$$;

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

  IF NEW.status = 'escalated' THEN
    NEW.escalated := true;
  END IF;

  IF NEW.status IN ('resolved', 'closed') AND NEW.resolved_at IS NULL THEN
    NEW.resolved_at := now();
  END IF;

  IF NEW.status NOT IN ('resolved', 'closed') THEN
    NEW.resolved_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customer_support_ticket_audit_fields ON public.customer_support_tickets;
CREATE TRIGGER trg_customer_support_ticket_audit_fields
BEFORE INSERT OR UPDATE ON public.customer_support_tickets
FOR EACH ROW
EXECUTE FUNCTION public.set_customer_support_ticket_audit_fields();

DROP POLICY IF EXISTS "Support users can view relevant tickets" ON public.customer_support_tickets;
CREATE POLICY "Support users can view relevant tickets"
ON public.customer_support_tickets
FOR SELECT
TO authenticated
USING (
  created_by = auth.uid()
  OR assigned_to = auth.uid()
  OR public.can_manage_customer_support_tickets(auth.uid())
);

DROP POLICY IF EXISTS "Authenticated users can create support tickets" ON public.customer_support_tickets;
CREATE POLICY "Authenticated users can create support tickets"
ON public.customer_support_tickets
FOR INSERT
TO authenticated
WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Support users can update relevant tickets" ON public.customer_support_tickets;
CREATE POLICY "Support users can update relevant tickets"
ON public.customer_support_tickets
FOR UPDATE
TO authenticated
USING (
  assigned_to = auth.uid()
  OR public.can_manage_customer_support_tickets(auth.uid())
)
WITH CHECK (
  assigned_to = auth.uid()
  OR public.can_manage_customer_support_tickets(auth.uid())
);