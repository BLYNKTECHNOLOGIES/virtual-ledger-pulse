
-- Drop and recreate the function with corrected return type
DROP FUNCTION IF EXISTS public.get_wallet_calculated_balances();

CREATE OR REPLACE FUNCTION public.get_wallet_calculated_balances()
RETURNS TABLE(wallet_id uuid, wallet_name text, calculated_balance numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT w.id, w.wallet_name,
    COALESCE(SUM(
      CASE 
        WHEN wt.transaction_type IN ('CREDIT', 'TRANSFER_IN') THEN wt.amount
        WHEN wt.transaction_type IN ('DEBIT', 'TRANSFER_OUT', 'FEE') THEN -wt.amount
        ELSE 0 
      END
    ), 0) as calculated_balance
  FROM wallets w
  LEFT JOIN wallet_transactions wt ON wt.wallet_id = w.id AND wt.asset_code = 'USDT'
  GROUP BY w.id, w.wallet_name;
$$;

-- Add CHECK constraint on wallet_transactions.transaction_type
ALTER TABLE public.wallet_transactions
ADD CONSTRAINT wallet_transactions_valid_type
CHECK (transaction_type IN ('CREDIT', 'DEBIT', 'TRANSFER_IN', 'TRANSFER_OUT', 'FEE'));
