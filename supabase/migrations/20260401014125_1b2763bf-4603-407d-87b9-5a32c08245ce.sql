
-- Step 1: Fix wallet transaction asset_code from USDT to BTC
UPDATE wallet_transactions
SET asset_code = 'BTC'
WHERE id = 'a7c81f78-165f-4009-bf90-ce00bc128e9a';

-- Step 2: Fix purchase order market_rate_usdt
UPDATE purchase_orders
SET market_rate_usdt = 68294
WHERE id = '32607f30-7e01-4a88-b8f6-f9b1cc0bc134';

-- Step 3: Fix terminal_purchase_sync order_data asset field
UPDATE terminal_purchase_sync
SET order_data = jsonb_set(order_data, '{asset}', '"BTC"')
WHERE binance_order_number = '22872418238104248320';

-- Step 4: Full resync wallet_asset_balances for affected wallet (USDT and BTC)
UPDATE wallet_asset_balances wab
SET 
  balance = sub.calc_balance,
  total_received = sub.calc_received,
  total_sent = sub.calc_sent,
  updated_at = now()
FROM (
  SELECT 
    wallet_id,
    asset_code,
    COALESCE(SUM(CASE WHEN transaction_type IN ('CREDIT','TRANSFER_IN') THEN amount ELSE 0 END), 0) AS calc_received,
    COALESCE(SUM(CASE WHEN transaction_type IN ('DEBIT','TRANSFER_OUT','FEE') THEN amount ELSE 0 END), 0) AS calc_sent,
    COALESCE(SUM(CASE WHEN transaction_type IN ('CREDIT','TRANSFER_IN') THEN amount ELSE -amount END), 0) AS calc_balance
  FROM wallet_transactions
  WHERE wallet_id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f'
    AND asset_code IN ('USDT', 'BTC')
  GROUP BY wallet_id, asset_code
) sub
WHERE wab.wallet_id = sub.wallet_id 
  AND wab.asset_code = sub.asset_code;
