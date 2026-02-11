-- Allow authenticated users to read asset_value_history
CREATE POLICY "Authenticated users can read asset value history"
ON public.asset_value_history
FOR SELECT
TO authenticated
USING (true);

-- Allow authenticated users to read daily_gross_profit_history
CREATE POLICY "Authenticated users can read daily gross profit history"
ON public.daily_gross_profit_history
FOR SELECT
TO authenticated
USING (true);