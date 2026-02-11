-- Drop existing policies and recreate for both anon and authenticated
DROP POLICY IF EXISTS "Authenticated users can read asset value history" ON public.asset_value_history;
DROP POLICY IF EXISTS "Authenticated users can read daily gross profit history" ON public.daily_gross_profit_history;

-- Allow all authenticated and anon users to read snapshot history
CREATE POLICY "Anyone can read asset value history"
ON public.asset_value_history
FOR SELECT
USING (true);

CREATE POLICY "Anyone can read daily gross profit history"
ON public.daily_gross_profit_history
FOR SELECT
USING (true);