CREATE TABLE public.client_operator_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  note text NOT NULL,
  created_by uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_operator_notes TO authenticated;
GRANT ALL ON public.client_operator_notes TO service_role;

ALTER TABLE public.client_operator_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view operator notes"
  ON public.client_operator_notes FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can add operator notes"
  ON public.client_operator_notes FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update operator notes"
  ON public.client_operator_notes FOR UPDATE
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete operator notes"
  ON public.client_operator_notes FOR DELETE
  TO authenticated USING (true);

CREATE INDEX idx_client_operator_notes_client ON public.client_operator_notes (client_id, created_at);

CREATE TRIGGER update_client_operator_notes_updated_at
  BEFORE UPDATE ON public.client_operator_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();