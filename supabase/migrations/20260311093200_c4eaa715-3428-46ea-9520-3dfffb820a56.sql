-- Fix corrupted TRX wallet_asset_positions
UPDATE wallet_asset_positions 
SET cost_pool_usdt = ROUND(qty_on_hand * 0.2875, 9),
    avg_cost_usdt = 0.2875,
    updated_at = now()
WHERE wallet_id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f' 
  AND asset_code = 'TRX';

-- Add safety guard: clamp any existing corrupted positions across the system
UPDATE wallet_asset_positions
SET avg_cost_usdt = CASE 
      WHEN avg_cost_usdt < 0 THEN 0
      WHEN avg_cost_usdt > 999999 THEN 0
      ELSE avg_cost_usdt
    END,
    cost_pool_usdt = CASE
      WHEN cost_pool_usdt < 0 THEN 0
      WHEN cost_pool_usdt > 999999999 THEN 0
      ELSE cost_pool_usdt
    END,
    updated_at = now()
WHERE avg_cost_usdt < 0 OR avg_cost_usdt > 999999 
   OR cost_pool_usdt < 0 OR cost_pool_usdt > 999999999;