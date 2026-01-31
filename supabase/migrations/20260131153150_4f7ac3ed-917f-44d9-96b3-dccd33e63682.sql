-- Allow negative wallet balances for adjustments and reversals by removing the blocking check trigger logic
-- (Balances are already allowed to go negative in this app’s rules.)

CREATE OR REPLACE FUNCTION public.check_wallet_balance_before_transaction()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Negative balances are explicitly allowed (reversals/adjustments).
  -- Validation is handled at the application/business-rule level where needed.
  RETURN NEW;
END;
$$;
