UPDATE wallet_asset_positions 
SET qty_on_hand = 991.226524790, 
    cost_pool_usdt = 991.226524790 * 0.2819, 
    avg_cost_usdt = 0.2819,
    updated_at = now()
WHERE wallet_id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f' AND asset_code = 'TRX';