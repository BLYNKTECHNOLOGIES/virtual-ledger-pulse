-- RA assignments
CREATE TABLE public.ra_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  ra_user_id uuid NOT NULL,
  ra_name text,
  assigned_by uuid,
  assigned_by_name text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ra_assignments_one_active_per_client
  ON public.ra_assignments (client_id) WHERE status = 'active';
CREATE INDEX ra_assignments_ra_user_idx ON public.ra_assignments (ra_user_id) WHERE status = 'active';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ra_assignments TO authenticated;
GRANT ALL ON public.ra_assignments TO service_role;
ALTER TABLE public.ra_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read ra assignments"
  ON public.ra_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert ra assignments"
  ON public.ra_assignments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update ra assignments"
  ON public.ra_assignments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- RA conversation log remarks
CREATE TABLE public.ra_client_remarks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  assignment_id uuid REFERENCES public.ra_assignments(id) ON DELETE SET NULL,
  ra_user_id uuid NOT NULL,
  ra_name text,
  remark text NOT NULL,
  contact_outcome text,
  file_url text,
  file_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ra_client_remarks_client_idx ON public.ra_client_remarks (client_id, created_at DESC);
CREATE INDEX ra_client_remarks_ra_idx ON public.ra_client_remarks (ra_user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ra_client_remarks TO authenticated;
GRANT ALL ON public.ra_client_remarks TO service_role;
ALTER TABLE public.ra_client_remarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read ra remarks"
  ON public.ra_client_remarks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert ra remarks"
  ON public.ra_client_remarks FOR INSERT TO authenticated WITH CHECK (true);

-- updated_at trigger for assignments
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_ra_assignments_updated_at
  BEFORE UPDATE ON public.ra_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Mirror RA remarks into client_communication_logs so they appear on the client page
CREATE OR REPLACE FUNCTION public.mirror_ra_remark_to_comm_log()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.client_communication_logs (client_id, communication_type, subject, content, logged_by, created_at)
  VALUES (
    NEW.client_id,
    'ra_remark',
    COALESCE('RA: ' || NEW.contact_outcome, 'RA Remark'),
    CASE WHEN NEW.file_name IS NOT NULL THEN NEW.remark || ' [Attachment: ' || NEW.file_name || ']' ELSE NEW.remark END,
    COALESCE(NEW.ra_name, 'Relationship Associate'),
    NEW.created_at
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER mirror_ra_remark_after_insert
  AFTER INSERT ON public.ra_client_remarks
  FOR EACH ROW EXECUTE FUNCTION public.mirror_ra_remark_to_comm_log();