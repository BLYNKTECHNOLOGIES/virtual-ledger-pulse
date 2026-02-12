
-- Fix double-reversal: DELETE trigger already adjusted balances, manual UPDATE doubled it
-- SHIB: current 70265270.85, should be 70096279.85 (over by 168991)
UPDATE wallet_asset_balances
SET balance = balance - 168991,
    total_sent = total_sent + 168991,
    updated_at = now()
WHERE wallet_id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f' AND asset_code = 'SHIB';

-- USDT: current 4556.543982, should be 4557.572108 (under by 1.02812603)
UPDATE wallet_asset_balances
SET balance = balance + 1.02812603,
    total_received = total_received + 1.02915519,
    total_sent = total_sent + 0.00102916,
    updated_at = now()
WHERE wallet_id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f' AND asset_code = 'USDT';

-- Fix wallets.current_balance
UPDATE wallets
SET current_balance = current_balance + 1.02812603
WHERE id = '6d9114f1-357b-41ee-8e5a-0dea754d5b4f';
