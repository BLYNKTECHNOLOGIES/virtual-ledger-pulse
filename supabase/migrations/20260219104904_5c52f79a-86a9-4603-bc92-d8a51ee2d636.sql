
-- Sync wallet_asset_balances USDT balance for BITGET to match wallets.current_balance (source of truth)
UPDATE wallet_asset_balances
SET balance = w.current_balance,
    updated_at = now()
FROM wallets w
WHERE wallet_asset_balances.wallet_id = w.id
  AND wallet_asset_balances.asset_code = 'USDT'
  AND w.wallet_name ILIKE '%bitget%';
