DROP FUNCTION IF EXISTS public.verify_wallet_asset_running_balance();

CREATE OR REPLACE FUNCTION public.verify_wallet_asset_running_balance()
RETURNS TABLE (
  wallet_id uuid,
  wallet_name text,
  asset_code text,
  transaction_id uuid,
  created_at timestamptz,
  transaction_type text,
  amount numeric,
  balance_before numeric,
  balance_after numeric,
  expected_running_total numeric,
  break_type text,
  details text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    wt.wallet_id,
    w.wallet_name,
    COALESCE(NULLIF(wt.asset_code,''), 'USDT') AS asset_code,
    wt.id AS transaction_id,
    wt.created_at,
    wt.transaction_type,
    wt.amount,
    wt.balance_before,
    wt.balance_after,
    (wt.balance_before
      + CASE WHEN wt.balance_after >= wt.balance_before
             THEN COALESCE(wt.amount,0)
             ELSE -COALESCE(wt.amount,0) END
    ) AS expected_running_total,
    'ARITHMETIC'::text AS break_type,
    format('|balance_after - balance_before| = %s but amount = %s',
           ABS(wt.balance_after - wt.balance_before), wt.amount) AS details
  FROM wallet_transactions wt
  JOIN wallets w ON w.id = wt.wallet_id
  WHERE LOWER(TRIM(w.wallet_name)) <> 'balance adjustment wallet'
    AND wt.balance_before IS NOT NULL
    AND wt.balance_after IS NOT NULL
    -- Skip audit-only rows (no balance change)
    AND wt.balance_after <> wt.balance_before
    AND ABS(ABS(wt.balance_after - wt.balance_before) - COALESCE(wt.amount,0)) > 0.00000001
  ORDER BY wt.wallet_id, asset_code, wt.sequence_no NULLS LAST, wt.created_at;
$$;