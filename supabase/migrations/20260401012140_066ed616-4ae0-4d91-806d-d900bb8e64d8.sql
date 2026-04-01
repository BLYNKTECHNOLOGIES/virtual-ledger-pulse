
-- Step 1: Full resync of wallet_asset_balances from ledger (fixes all drift)
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
  GROUP BY wallet_id, asset_code
) sub
WHERE wab.wallet_id = sub.wallet_id 
  AND wab.asset_code = sub.asset_code;

-- Step 2: Also resync the wallets.current_balance for USDT
UPDATE wallets w
SET 
  current_balance = GREATEST(0, sub.calc_balance),
  total_received = sub.calc_received,
  total_sent = sub.calc_sent,
  updated_at = now()
FROM (
  SELECT 
    wallet_id,
    COALESCE(SUM(CASE WHEN transaction_type IN ('CREDIT','TRANSFER_IN') THEN amount ELSE 0 END), 0) AS calc_received,
    COALESCE(SUM(CASE WHEN transaction_type IN ('DEBIT','TRANSFER_OUT','FEE') THEN amount ELSE 0 END), 0) AS calc_sent,
    COALESCE(SUM(CASE WHEN transaction_type IN ('CREDIT','TRANSFER_IN') THEN amount ELSE -amount END), 0) AS calc_balance
  FROM wallet_transactions
  WHERE asset_code = 'USDT'
  GROUP BY wallet_id
) sub
WHERE w.id = sub.wallet_id;
