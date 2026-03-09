
-- Helper RPCs for snapshot edge function to calculate SUM-based balances

-- Wallet calculated balances (SUM of wallet_transactions per wallet+asset)
CREATE OR REPLACE FUNCTION public.get_wallet_calculated_balances()
RETURNS TABLE (
  wallet_id UUID,
  asset_code TEXT,
  calculated_balance NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    wt.wallet_id,
    wt.asset_code,
    COALESCE(SUM(
      CASE 
        WHEN wt.transaction_type IN ('CREDIT', 'TRANSFER_IN') THEN wt.amount 
        WHEN wt.transaction_type IN ('DEBIT', 'TRANSFER_OUT', 'FEE') THEN -wt.amount 
        ELSE 0 
      END
    ), 0) as calculated_balance
  FROM wallet_transactions wt
  GROUP BY wt.wallet_id, wt.asset_code;
$$;

-- Bank calculated balances (SUM of bank_transactions per account)
CREATE OR REPLACE FUNCTION public.get_bank_calculated_balances()
RETURNS TABLE (
  bank_account_id UUID,
  calculated_balance NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    bt.bank_account_id,
    COALESCE(SUM(
      CASE 
        WHEN bt.transaction_type IN ('INCOME', 'TRANSFER_IN') THEN bt.amount
        WHEN bt.transaction_type IN ('EXPENSE', 'TRANSFER_OUT') THEN -bt.amount
        ELSE 0
      END
    ), 0) as calculated_balance
  FROM bank_transactions bt
  GROUP BY bt.bank_account_id;
$$;
