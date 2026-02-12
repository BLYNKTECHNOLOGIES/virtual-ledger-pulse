-- Fix RLS: change role from authenticated to public to match other purchase tables
DROP POLICY IF EXISTS "Allow authenticated read" ON public.purchase_order_payment_splits;
DROP POLICY IF EXISTS "Allow authenticated insert" ON public.purchase_order_payment_splits;

CREATE POLICY "Allow read access on payment splits"
  ON public.purchase_order_payment_splits FOR SELECT
  USING (true);

CREATE POLICY "Allow insert on payment splits"
  ON public.purchase_order_payment_splits FOR INSERT
  WITH CHECK (true);