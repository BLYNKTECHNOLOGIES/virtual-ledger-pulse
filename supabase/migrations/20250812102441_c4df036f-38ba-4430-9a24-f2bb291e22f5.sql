-- Fix: Bank balances not updating after transactions
-- Root cause: triggers were missing; create them idempotently

-- 1) Ensure the balance sync trigger is present on bank_transactions
DROP TRIGGER IF EXISTS trg_bank_transactions_update_balance ON public.bank_transactions;
CREATE TRIGGER trg_bank_transactions_update_balance
AFTER INSERT OR UPDATE OR DELETE ON public.bank_transactions
FOR EACH ROW
EXECUTE FUNCTION public.update_bank_account_balance();

-- 2) Ensure the balance lock trigger is present to prevent manual edits after first transaction
DROP TRIGGER IF EXISTS trg_lock_balance_after_transaction ON public.bank_transactions;
CREATE TRIGGER trg_lock_balance_after_transaction
AFTER INSERT ON public.bank_transactions
FOR EACH ROW
EXECUTE FUNCTION public.lock_bank_account_balance_after_transaction();