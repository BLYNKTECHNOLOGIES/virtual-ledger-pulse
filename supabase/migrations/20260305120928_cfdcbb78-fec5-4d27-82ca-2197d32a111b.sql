
-- Allow anon role to insert, select, update on shift_reconciliations
ALTER TABLE public.shift_reconciliations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon insert on shift_reconciliations"
  ON public.shift_reconciliations FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow anon select on shift_reconciliations"
  ON public.shift_reconciliations FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow anon update on shift_reconciliations"
  ON public.shift_reconciliations FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
