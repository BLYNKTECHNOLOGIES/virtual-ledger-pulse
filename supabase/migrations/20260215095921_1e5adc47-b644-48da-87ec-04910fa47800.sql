-- Fix: Allow read access to wallet_asset_positions (matching wallets table pattern)
DROP POLICY IF EXISTS "Authenticated users can view positions" ON public.wallet_asset_positions;
CREATE POLICY "Allow read access to wallet_asset_positions" 
ON public.wallet_asset_positions 
FOR SELECT 
USING (true);