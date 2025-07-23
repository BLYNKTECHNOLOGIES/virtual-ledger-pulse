-- Add balance_locked column to bank_accounts table to prevent balance editing after transactions
ALTER TABLE public.bank_accounts 
ADD COLUMN IF NOT EXISTS balance_locked BOOLEAN NOT NULL DEFAULT false;

-- Create function to check if bank account has transactions
CREATE OR REPLACE FUNCTION public.bank_account_has_transactions(account_id_param UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.bank_transactions 
    WHERE bank_account_id = account_id_param
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to lock balance after first transaction
CREATE OR REPLACE FUNCTION public.lock_bank_account_balance_after_transaction()
RETURNS TRIGGER AS $$
BEGIN
  -- Lock the bank account balance after any transaction is created
  UPDATE public.bank_accounts 
  SET balance_locked = true
  WHERE id = NEW.bank_account_id AND balance_locked = false;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for bank_transactions
DROP TRIGGER IF EXISTS trigger_lock_balance_after_transaction ON public.bank_transactions;
CREATE TRIGGER trigger_lock_balance_after_transaction
  AFTER INSERT ON public.bank_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.lock_bank_account_balance_after_transaction();

-- Add validation to prevent balance editing when locked
CREATE OR REPLACE FUNCTION public.validate_balance_edit()
RETURNS TRIGGER AS $$
BEGIN
  -- Prevent balance updates if account is locked and balance is being changed
  IF OLD.balance_locked = true AND NEW.balance != OLD.balance THEN
    RAISE EXCEPTION 'Cannot modify balance: Account balance is locked due to existing transactions';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to validate balance edits
DROP TRIGGER IF EXISTS trigger_validate_balance_edit ON public.bank_accounts;
CREATE TRIGGER trigger_validate_balance_edit
  BEFORE UPDATE ON public.bank_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_balance_edit();