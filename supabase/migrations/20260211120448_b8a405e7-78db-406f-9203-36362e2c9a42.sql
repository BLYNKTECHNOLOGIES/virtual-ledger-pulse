
-- Drop existing policies
DROP POLICY IF EXISTS "Authenticated users can insert trade history" ON public.spot_trade_history;
DROP POLICY IF EXISTS "Authenticated users can update trade history" ON public.spot_trade_history;
DROP POLICY IF EXISTS "Authenticated users can view trade history" ON public.spot_trade_history;

-- Recreate with proper permissions for upsert
CREATE POLICY "Allow authenticated select" ON public.spot_trade_history
  FOR SELECT USING (true);

CREATE POLICY "Allow authenticated insert" ON public.spot_trade_history
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow authenticated update" ON public.spot_trade_history
  FOR UPDATE USING (true) WITH CHECK (true);
