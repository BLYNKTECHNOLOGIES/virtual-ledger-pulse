
CREATE TABLE public.client_limit_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  client_name TEXT,
  previous_limit NUMERIC DEFAULT 0,
  requested_limit NUMERIC NOT NULL,
  increase_percentage NUMERIC,
  justification TEXT,
  expected_usage TEXT,
  risk_assessment TEXT,
  status TEXT DEFAULT 'APPROVED',
  requested_at TIMESTAMPTZ DEFAULT now(),
  requested_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.client_limit_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to client_limit_requests" ON public.client_limit_requests
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
