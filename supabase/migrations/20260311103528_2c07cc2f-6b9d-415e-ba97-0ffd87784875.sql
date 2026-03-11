
-- Fix: balance check should only fire on INSERT or when amount/type actually changes, not on metadata updates
CREATE OR REPLACE FUNCTION check_bank_balance_before_transaction()
RETURNS TRIGGER AS $$
DECLARE
  current_balance NUMERIC;
  account_name TEXT;
BEGIN
  -- Only check on INSERT, or UPDATE that changes amount/type/bank_account_id
  IF TG_OP = 'UPDATE' THEN
    IF NEW.amount = OLD.amount 
       AND NEW.transaction_type = OLD.transaction_type 
       AND NEW.bank_account_id = OLD.bank_account_id THEN
      -- Metadata-only update (e.g. created_by, description) — skip balance check
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.transaction_type = 'EXPENSE' THEN
    SELECT ba.balance, ba.account_name INTO current_balance, account_name
    FROM bank_accounts ba WHERE ba.id = NEW.bank_account_id;
    
    IF current_balance IS NULL THEN
      RAISE EXCEPTION 'Bank account not found';
    END IF;
    
    IF current_balance < NEW.amount THEN
      RAISE EXCEPTION 'Insufficient funds in account "%". Current balance: %, Required: %', 
        account_name, current_balance, NEW.amount;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
