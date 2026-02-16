
-- Seed wallet_asset_positions for ETH and BTC from wallet_asset_balances
-- Using approximate current market rates as cost basis since no BUY conversion history exists

-- ETH: balance 0.10728333, approx rate ~$1960
UPDATE wallet_asset_positions
SET qty_on_hand = 0.107283330,
    cost_pool_usdt = 0.107283330 * 1960,
    avg_cost_usdt = 1960,
    updated_at = now()
WHERE wallet_id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f' AND asset_code = 'ETH';

-- BTC: balance 0.01510274, approx rate ~$68447
UPDATE wallet_asset_positions
SET qty_on_hand = 0.015102740,
    cost_pool_usdt = 0.015102740 * 68447,
    avg_cost_usdt = 68447,
    updated_at = now()
WHERE wallet_id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f' AND asset_code = 'BTC';
