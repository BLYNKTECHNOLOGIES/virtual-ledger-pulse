
-- Update bank_transactions trigger to include specific bank account details in error
CREATE OR REPLACE FUNCTION public.check_bank_balance_before_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  current_bal NUMERIC;
  effective_balance NUMERIC;
  acct_type TEXT;
  acct_name TEXT;
BEGIN
  SELECT balance, account_type, account_name INTO current_bal, acct_type, acct_name
  FROM bank_accounts 
  WHERE id = NEW.bank_account_id;

  IF acct_type = 'CREDIT' THEN
    RETURN NEW;
  END IF;

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

  IF NEW.transaction_type IN ('EXPENSE', 'TRANSFER_OUT') THEN
    IF effective_balance < NEW.amount THEN
      RAISE EXCEPTION 'Insufficient balance in %. Available: ₹%, Required: ₹%', acct_name, effective_balance, NEW.amount;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
