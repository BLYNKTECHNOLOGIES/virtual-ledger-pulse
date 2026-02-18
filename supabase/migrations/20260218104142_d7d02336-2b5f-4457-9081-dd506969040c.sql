CREATE OR REPLACE FUNCTION public.check_bank_balance_before_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  current_bal NUMERIC;
  effective_balance NUMERIC;
BEGIN
  -- Get current balance
  SELECT balance INTO current_bal 
  FROM bank_accounts 
  WHERE id = NEW.bank_account_id;

  -- For UPDATE: restore the old amount to get the "pre-transaction" balance
  IF TG_OP = 'UPDATE' THEN
    IF OLD.transaction_type IN ('EXPENSE', 'TRANSFER_OUT') THEN
      -- Old expense was already deducted, add it back for the check
      effective_balance := current_bal + OLD.amount;
    ELSIF OLD.transaction_type IN ('INCOME', 'TRANSFER_IN') THEN
      -- Old income was already added, remove it for the check
      effective_balance := current_bal - OLD.amount;
    ELSE
      effective_balance := current_bal;
    END IF;
  ELSE
    -- For INSERT, use current balance as-is
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