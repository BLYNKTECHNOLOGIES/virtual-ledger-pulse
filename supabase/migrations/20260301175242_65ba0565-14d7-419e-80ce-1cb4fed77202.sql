
-- 1. Drop the strict non-negative constraint on bank_accounts
ALTER TABLE bank_accounts DROP CONSTRAINT IF EXISTS check_bank_balance_non_negative;

-- 2. Add new constraint: balance >= 0 unless account_type = 'CREDIT'
ALTER TABLE bank_accounts ADD CONSTRAINT check_bank_balance_non_negative
  CHECK (balance >= 0 OR account_type = 'CREDIT');

-- 3. Update the trigger to skip balance check for CREDIT accounts
CREATE OR REPLACE FUNCTION public.check_bank_balance_before_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  current_bal NUMERIC;
  effective_balance NUMERIC;
  acct_type TEXT;
BEGIN
  -- Get current balance and account type
  SELECT balance, account_type INTO current_bal, acct_type
  FROM bank_accounts 
  WHERE id = NEW.bank_account_id;

  -- Credit accounts are allowed to go negative — skip check
  IF acct_type = 'CREDIT' THEN
    RETURN NEW;
  END IF;

  -- For UPDATE: restore the old amount to get the "pre-transaction" balance
  IF TG_OP = 'UPDATE' THEN
    IF OLD.transaction_type IN ('EXPENSE', 'TRANSFER_OUT') THEN
      effective_balance := current_bal + OLD.amount;
    ELSIF OLD.transaction_type IN ('INCOME', 'TRANSFER_IN') THEN
      effective_balance := current_bal - OLD.amount;
    ELSE
      effective_balance := current_bal;
    END IF;
  ELSE
    effective_balance := current_bal;
  END IF;

  -- Check if the new transaction would make balance negative
  IF NEW.transaction_type IN ('EXPENSE', 'TRANSFER_OUT') THEN
    IF effective_balance < NEW.amount THEN
      RAISE EXCEPTION 'It cannot be negative check previous entries and balances again!';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
