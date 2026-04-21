-- Reverse ALL reconciliation entries posted by recent buggy batches.
-- spot_trade_history.quantity / quote_quantity represents a SINGLE fill, not the order total.
-- An order with multiple fills was being compared against just one of them, producing false variances.

DELETE FROM public.wallet_transactions
WHERE reference_type = 'OPENING_BALANCE_ADJUSTMENT'
  AND (
    description LIKE 'Reconciliation:%'
    OR description LIKE 'Reconciliation v2:%'
    OR description LIKE 'BNB fee mirror%'
  );

-- Recalc balances from ledger truth for any wallet/asset that had an entry removed
UPDATE public.wallet_asset_balances wab
SET balance = (
  SELECT COALESCE(SUM(CASE WHEN transaction_type = 'CREDIT' THEN amount ELSE -amount END), 0)
  FROM public.wallet_transactions
  WHERE wallet_id = wab.wallet_id AND asset_code = wab.asset_code
),
updated_at = now()
WHERE wab.asset_code IN ('USDT','BNB');