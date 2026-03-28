-- Fix F7: Add TRANSFER_OUT to bank balance pre-check alongside EXPENSE
CREATE OR REPLACE FUNCTION public.check_bank_balance_before_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_balance NUMERIC;
  account_name TEXT;
  acct_type TEXT;
BEGIN
  -- Skip metadata-only updates
  IF TG_OP = 'UPDATE' THEN
    IF NEW.amount = OLD.amount 
       AND NEW.transaction_type = OLD.transaction_type 
       AND NEW.bank_account_id = OLD.bank_account_id THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Guard both EXPENSE and TRANSFER_OUT against overdraft
  IF NEW.transaction_type IN ('EXPENSE', 'TRANSFER_OUT') THEN
    SELECT ba.balance, ba.account_name, ba.account_type
    INTO current_balance, account_name, acct_type
    FROM bank_accounts ba WHERE ba.id = NEW.bank_account_id;
    
    IF current_balance IS NULL THEN
      RAISE EXCEPTION 'Bank account not found';
    END IF;

    -- CREDIT accounts are allowed to go negative
    IF UPPER(TRIM(COALESCE(acct_type, ''))) = 'CREDIT' THEN
      RETURN NEW;
    END IF;
    
    IF current_balance < NEW.amount THEN
      RAISE EXCEPTION 'Insufficient funds in account "%". Current balance: %, Required: %', 
        account_name, current_balance, NEW.amount;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;