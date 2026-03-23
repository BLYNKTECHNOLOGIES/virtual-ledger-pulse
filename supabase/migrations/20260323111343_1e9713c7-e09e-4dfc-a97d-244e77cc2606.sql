CREATE TABLE public.client_communication_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  communication_type text NOT NULL DEFAULT 'note',
  subject text,
  content text NOT NULL,
  logged_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_communication_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all authenticated users to manage communication logs"
ON public.client_communication_logs
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);