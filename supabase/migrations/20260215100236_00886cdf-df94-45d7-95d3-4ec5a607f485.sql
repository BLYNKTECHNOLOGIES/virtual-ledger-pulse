-- Sync wallet_asset_positions for SOL to match wallet_asset_balances
-- The position has 6.190243 but actual balance is 13.380486
-- The missing 7.190243 was from a previously approved BUY conversion
UPDATE public.wallet_asset_positions
SET qty_on_hand = 13.380486000,
    cost_pool_usdt = 13.380486000 * 95.300000000,  -- using avg cost from last BUY price
    avg_cost_usdt = 95.300000000,
    updated_at = now()
WHERE wallet_id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f'
  AND asset_code = 'SOL';