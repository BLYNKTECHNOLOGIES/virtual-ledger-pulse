-- Triggers to keep bank account balances in sync with bank_transactions and validate operations

-- 1) Auto-update bank account balances when bank_transactions change
DROP TRIGGER IF EXISTS trg_bank_transactions_balance_update ON public.bank_transactions;
CREATE TRIGGER trg_bank_transactions_balance_update
AFTER INSERT OR UPDATE OR DELETE ON public.bank_transactions
FOR EACH ROW EXECUTE FUNCTION public.update_bank_account_balance();

-- 2) Prevent overdrafts and invalid values on bank_transactions
DROP TRIGGER IF EXISTS trg_bank_transactions_validate ON public.bank_transactions;
CREATE TRIGGER trg_bank_transactions_validate
BEFORE INSERT OR UPDATE ON public.bank_transactions
FOR EACH ROW EXECUTE FUNCTION public.validate_negative_values();

-- 3) Lock bank account balance after the first transaction is created
DROP TRIGGER IF EXISTS trg_bank_transactions_lock ON public.bank_transactions;
CREATE TRIGGER trg_bank_transactions_lock
AFTER INSERT ON public.bank_transactions
FOR EACH ROW EXECUTE FUNCTION public.lock_bank_account_balance_after_transaction();

-- 4) Disallow direct balance edits on locked accounts
DROP TRIGGER IF EXISTS trg_bank_accounts_validate_edit ON public.bank_accounts;
CREATE TRIGGER trg_bank_accounts_validate_edit
BEFORE UPDATE ON public.bank_accounts
FOR EACH ROW EXECUTE FUNCTION public.validate_balance_edit();