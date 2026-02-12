
-- Drop old restrictive policy and replace with one that works for the current auth setup
DROP POLICY IF EXISTS "Authenticated users can manage terminal sync records" ON public.terminal_purchase_sync;

CREATE POLICY "Allow all operations on terminal_purchase_sync"
  ON public.terminal_purchase_sync
  FOR ALL
  USING (true)
  WITH CHECK (true);
