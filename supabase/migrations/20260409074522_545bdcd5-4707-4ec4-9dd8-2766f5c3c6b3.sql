
CREATE TABLE public.client_income_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  primary_source_of_income TEXT,
  occupation_business_type TEXT,
  monthly_income_range NUMERIC,
  source_of_fund_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_client_income UNIQUE (client_id)
);

ALTER TABLE public.client_income_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view income details"
  ON public.client_income_details FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert income details"
  ON public.client_income_details FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update income details"
  ON public.client_income_details FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete income details"
  ON public.client_income_details FOR DELETE TO authenticated USING (true);
