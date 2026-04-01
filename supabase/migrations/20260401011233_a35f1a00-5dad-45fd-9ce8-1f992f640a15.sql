-- Step 1: Fix the wallet transaction asset_code
UPDATE wallet_transactions 
SET asset_code = 'ETH'
WHERE id = 'bd74ad5c-e974-4959-a17e-de545e43666a';

-- Step 2: Recalculate USDT balance for BINANCE BLYNK wallet
UPDATE wallet_asset_balances 
SET balance = (SELECT COALESCE(SUM(CASE WHEN transaction_type='CREDIT' THEN amount ELSE -amount END), 0) 
               FROM wallet_transactions WHERE wallet_id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f' AND asset_code = 'USDT'),
    total_received = (SELECT COALESCE(SUM(amount), 0) FROM wallet_transactions WHERE wallet_id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f' AND asset_code = 'USDT' AND transaction_type = 'CREDIT'),
    total_sent = (SELECT COALESCE(SUM(amount), 0) FROM wallet_transactions WHERE wallet_id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f' AND asset_code = 'USDT' AND transaction_type = 'DEBIT')
WHERE wallet_id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f' AND asset_code = 'USDT';

-- Step 3: Recalculate ETH balance for BINANCE BLYNK wallet
UPDATE wallet_asset_balances 
SET balance = (SELECT COALESCE(SUM(CASE WHEN transaction_type='CREDIT' THEN amount ELSE -amount END), 0) 
               FROM wallet_transactions WHERE wallet_id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f' AND asset_code = 'ETH'),
    total_received = (SELECT COALESCE(SUM(amount), 0) FROM wallet_transactions WHERE wallet_id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f' AND asset_code = 'ETH' AND transaction_type = 'CREDIT'),
    total_sent = (SELECT COALESCE(SUM(amount), 0) FROM wallet_transactions WHERE wallet_id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f' AND asset_code = 'ETH' AND transaction_type = 'DEBIT')
WHERE wallet_id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f' AND asset_code = 'ETH';