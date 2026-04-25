CREATE TABLE IF NOT EXISTS public.customer_support_ticket_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.customer_support_tickets(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL DEFAULT 'note',
  message TEXT NOT NULL,
  actor_id UUID NOT NULL,
  metadata JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT customer_support_ticket_activities_type_check CHECK (activity_type IN ('note', 'status_change', 'escalation', 'transfer', 'attachment')),
  CONSTRAINT customer_support_ticket_activities_message_len CHECK (char_length(trim(message)) BETWEEN 1 AND 4000)
);

CREATE INDEX IF NOT EXISTS idx_customer_support_ticket_activities_ticket_created
ON public.customer_support_ticket_activities (ticket_id, created_at DESC);

ALTER TABLE public.customer_support_ticket_activities ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.customer_support_ticket_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.customer_support_tickets(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT NULL,
  file_size BIGINT NULL,
  uploaded_by UUID NOT NULL,
  note TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT customer_support_ticket_attachments_name_len CHECK (char_length(trim(file_name)) BETWEEN 1 AND 255),
  CONSTRAINT customer_support_ticket_attachments_note_len CHECK (note IS NULL OR char_length(trim(note)) <= 2000)
);

CREATE INDEX IF NOT EXISTS idx_customer_support_ticket_attachments_ticket_created
ON public.customer_support_ticket_attachments (ticket_id, created_at DESC);

ALTER TABLE public.customer_support_ticket_attachments ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public)
VALUES ('support-ticket-attachments', 'support-ticket-attachments', false)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.can_access_customer_support_ticket(_ticket_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.customer_support_tickets t
    WHERE t.id = _ticket_id
      AND (
        t.created_by = _user_id
        OR t.assigned_to = _user_id
        OR public.can_manage_customer_support_tickets(_user_id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.set_customer_support_activity_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.message := trim(NEW.message);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customer_support_activity_fields ON public.customer_support_ticket_activities;
CREATE TRIGGER trg_customer_support_activity_fields
BEFORE INSERT OR UPDATE ON public.customer_support_ticket_activities
FOR EACH ROW
EXECUTE FUNCTION public.set_customer_support_activity_fields();

CREATE OR REPLACE FUNCTION public.set_customer_support_attachment_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.file_name := trim(NEW.file_name);
  NEW.note := nullif(trim(coalesce(NEW.note, '')), '');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customer_support_attachment_fields ON public.customer_support_ticket_attachments;
CREATE TRIGGER trg_customer_support_attachment_fields
BEFORE INSERT OR UPDATE ON public.customer_support_ticket_attachments
FOR EACH ROW
EXECUTE FUNCTION public.set_customer_support_attachment_fields();

DROP POLICY IF EXISTS "Support users can view ticket activities" ON public.customer_support_ticket_activities;
CREATE POLICY "Support users can view ticket activities"
ON public.customer_support_ticket_activities
FOR SELECT
TO authenticated
USING (public.can_access_customer_support_ticket(ticket_id, auth.uid()));

DROP POLICY IF EXISTS "Support users can add ticket activities" ON public.customer_support_ticket_activities;
CREATE POLICY "Support users can add ticket activities"
ON public.customer_support_ticket_activities
FOR INSERT
TO authenticated
WITH CHECK (actor_id = auth.uid() AND public.can_access_customer_support_ticket(ticket_id, auth.uid()));

DROP POLICY IF EXISTS "Support users can view ticket attachments" ON public.customer_support_ticket_attachments;
CREATE POLICY "Support users can view ticket attachments"
ON public.customer_support_ticket_attachments
FOR SELECT
TO authenticated
USING (public.can_access_customer_support_ticket(ticket_id, auth.uid()));

DROP POLICY IF EXISTS "Support users can add ticket attachments" ON public.customer_support_ticket_attachments;
CREATE POLICY "Support users can add ticket attachments"
ON public.customer_support_ticket_attachments
FOR INSERT
TO authenticated
WITH CHECK (uploaded_by = auth.uid() AND public.can_access_customer_support_ticket(ticket_id, auth.uid()));

DROP POLICY IF EXISTS "Support users can upload ticket files" ON storage.objects;
CREATE POLICY "Support users can upload ticket files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'support-ticket-attachments'
  AND public.can_access_customer_support_ticket((storage.foldername(name))[1]::uuid, auth.uid())
);

DROP POLICY IF EXISTS "Support users can view ticket files" ON storage.objects;
CREATE POLICY "Support users can view ticket files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'support-ticket-attachments'
  AND public.can_access_customer_support_ticket((storage.foldername(name))[1]::uuid, auth.uid())
);

DROP POLICY IF EXISTS "Support users can update ticket files" ON storage.objects;
CREATE POLICY "Support users can update ticket files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'support-ticket-attachments'
  AND public.can_access_customer_support_ticket((storage.foldername(name))[1]::uuid, auth.uid())
)
WITH CHECK (
  bucket_id = 'support-ticket-attachments'
  AND public.can_access_customer_support_ticket((storage.foldername(name))[1]::uuid, auth.uid())
);