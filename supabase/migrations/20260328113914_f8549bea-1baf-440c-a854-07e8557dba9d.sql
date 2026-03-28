-- Fix dust BTC position on BITGET with market rate
UPDATE public.wallet_asset_positions
SET avg_cost_usdt = 87000,
    cost_pool_usdt = qty_on_hand * 87000
WHERE id = '722aaae5-4de6-4fd0-b8a8-077daa403386'
  AND asset_code = 'BTC' AND avg_cost_usdt = 0;

-- Fix dust USDC position on BINANCE BLYNK (stablecoin = $1)
UPDATE public.wallet_asset_positions
SET avg_cost_usdt = 1.0,
    cost_pool_usdt = qty_on_hand * 1.0
WHERE id = '806b2743-3022-4f7a-b318-ba6a7d1f936a'
  AND asset_code = 'USDC' AND avg_cost_usdt = 0;

-- Fix dust XRP position on BINANCE BLYNK with market rate
UPDATE public.wallet_asset_positions
SET avg_cost_usdt = 2.50,
    cost_pool_usdt = qty_on_hand * 2.50
WHERE id = '10730c66-e3fb-4acc-af46-17ab6362ef24'
  AND asset_code = 'XRP' AND avg_cost_usdt = 0;