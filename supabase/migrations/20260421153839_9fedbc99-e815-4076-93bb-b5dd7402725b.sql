-- Rebuild wallet_asset_balances cache from wallet_transactions ledger using correct sign logic
WITH recomputed AS (
  SELECT
    wt.wallet_id,
    wt.asset_code,
    SUM(
      CASE
        WHEN wt.transaction_type IN ('CREDIT', 'TRANSFER_IN') THEN wt.amount
        WHEN wt.transaction_type IN ('DEBIT', 'FEE', 'TRANSFER_OUT') THEN -wt.amount
        ELSE 0
      END
    ) AS true_balance
  FROM public.wallet_transactions wt
  GROUP BY wt.wallet_id, wt.asset_code
)
UPDATE public.wallet_asset_balances wab
SET balance = r.true_balance,
    updated_at = now()
FROM recomputed r
WHERE wab.wallet_id = r.wallet_id
  AND wab.asset_code = r.asset_code
  AND ROUND(wab.balance::numeric, 8) <> ROUND(r.true_balance::numeric, 8);

INSERT INTO public.wallet_asset_balances (wallet_id, asset_code, balance, updated_at)
SELECT
  wt.wallet_id,
  wt.asset_code,
  SUM(
    CASE
      WHEN wt.transaction_type IN ('CREDIT', 'TRANSFER_IN') THEN wt.amount
      WHEN wt.transaction_type IN ('DEBIT', 'FEE', 'TRANSFER_OUT') THEN -wt.amount
      ELSE 0
    END
  ),
  now()
FROM public.wallet_transactions wt
LEFT JOIN public.wallet_asset_balances wab
  ON wab.wallet_id = wt.wallet_id AND wab.asset_code = wt.asset_code
WHERE wab.id IS NULL
GROUP BY wt.wallet_id, wt.asset_code;