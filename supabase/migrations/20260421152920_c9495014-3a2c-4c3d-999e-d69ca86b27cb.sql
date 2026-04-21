DELETE FROM public.wallet_transactions
WHERE reference_type = 'OPENING_BALANCE_ADJUSTMENT'
  AND created_at >= '2026-04-21 14:00:00'
  AND created_at < '2026-04-21 16:00:00';

UPDATE public.wallet_asset_balances wab
SET balance = (
  SELECT COALESCE(SUM(CASE WHEN transaction_type = 'CREDIT' THEN amount ELSE -amount END), 0)
  FROM public.wallet_transactions
  WHERE wallet_id = wab.wallet_id AND asset_code = wab.asset_code
),
updated_at = now()
WHERE wab.asset_code IN ('USDT','BNB');