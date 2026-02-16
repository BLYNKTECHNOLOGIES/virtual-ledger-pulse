
-- Seed USDC position to match actual wallet_asset_balances
UPDATE wallet_asset_positions
SET qty_on_hand = 315.19,
    cost_pool_usdt = 315.19,
    avg_cost_usdt = 1.0,
    updated_at = now()
WHERE wallet_id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f'
  AND asset_code = 'USDC';

-- Seed BTC position to match actual wallet_asset_balances
UPDATE wallet_asset_positions
SET qty_on_hand = 0.012231510,
    cost_pool_usdt = 1186.43,
    avg_cost_usdt = 97000.0,
    updated_at = now()
WHERE wallet_id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f'
  AND asset_code = 'BTC';

-- Seed SOL position to match actual wallet_asset_balances  
UPDATE wallet_asset_positions
SET qty_on_hand = 0.000333170,
    cost_pool_usdt = 0.057,
    avg_cost_usdt = 171.0,
    updated_at = now()
WHERE wallet_id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f'
  AND asset_code = 'SOL';
