
-- Drop the existing policy and recreate with both roles
DROP POLICY IF EXISTS "Authenticated users can read bank_bulk_formats" ON public.bank_bulk_formats;

CREATE POLICY "Anyone can read bank_bulk_formats"
  ON public.bank_bulk_formats
  FOR SELECT
  TO authenticated, anon
  USING (true);
