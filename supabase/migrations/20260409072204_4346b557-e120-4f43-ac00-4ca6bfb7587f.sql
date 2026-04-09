
CREATE TABLE public.client_bank_details (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  bank_name TEXT NOT NULL,
  last_four_digits TEXT NOT NULL CHECK (char_length(last_four_digits) = 4),
  statement_url TEXT,
  statement_period_from DATE,
  statement_period_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_bank_details_client_id ON public.client_bank_details(client_id);

ALTER TABLE public.client_bank_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view bank details"
  ON public.client_bank_details FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert bank details"
  ON public.client_bank_details FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update bank details"
  ON public.client_bank_details FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete bank details"
  ON public.client_bank_details FOR DELETE
  TO authenticated
  USING (true);
