-- Ensure bank balance updates and validations via triggers
-- 1) Update bank account balance when bank_transactions change
DROP TRIGGER IF EXISTS trg_bank_transactions_balance ON public.bank_transactions;
CREATE TRIGGER trg_bank_transactions_balance
AFTER INSERT OR UPDATE OR DELETE ON public.bank_transactions
FOR EACH ROW EXECUTE FUNCTION public.update_bank_account_balance();

-- 2) Lock bank account balance after any transaction is created (first transaction or subsequent)
DROP TRIGGER IF EXISTS trg_lock_balance_after_bank_tx ON public.bank_transactions;
CREATE TRIGGER trg_lock_balance_after_bank_tx
AFTER INSERT ON public.bank_transactions
FOR EACH ROW EXECUTE FUNCTION public.lock_bank_account_balance_after_transaction();

-- 3) Prevent negative balances/values at the source
DROP TRIGGER IF EXISTS trg_validate_bank_transactions ON public.bank_transactions;
CREATE TRIGGER trg_validate_bank_transactions
BEFORE INSERT OR UPDATE ON public.bank_transactions
FOR EACH ROW EXECUTE FUNCTION public.validate_negative_values();

-- 4) Disallow manual edits to locked balances while still updating updated_at timestamp correctly
DROP TRIGGER IF EXISTS trg_validate_balance_edit ON public.bank_accounts;
CREATE TRIGGER trg_validate_balance_edit
BEFORE UPDATE ON public.bank_accounts
FOR EACH ROW EXECUTE FUNCTION public.validate_balance_edit();

DROP TRIGGER IF EXISTS trg_update_bank_accounts_updated_at ON public.bank_accounts;
CREATE TRIGGER trg_update_bank_accounts_updated_at
BEFORE UPDATE ON public.bank_accounts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
