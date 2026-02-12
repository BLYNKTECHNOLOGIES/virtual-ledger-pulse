
-- Drop restrictive policies on counterparty_pan_records
DROP POLICY IF EXISTS "Authenticated users can manage PAN records" ON public.counterparty_pan_records;
DROP POLICY IF EXISTS "Authenticated users can view PAN records" ON public.counterparty_pan_records;

-- Replace with open policies matching counterparty_contact_records pattern
CREATE POLICY "Allow all access to counterparty_pan_records"
  ON public.counterparty_pan_records
  FOR ALL
  USING (true)
  WITH CHECK (true);
