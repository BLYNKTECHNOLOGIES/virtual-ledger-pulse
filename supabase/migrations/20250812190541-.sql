-- Ensure triggers update bank balances automatically on bank_transactions
-- 1) Recreate balance update trigger (idempotent)
DROP TRIGGER IF EXISTS trg_bank_transactions_update_balance ON public.bank_transactions;
CREATE TRIGGER trg_bank_transactions_update_balance
AFTER INSERT OR UPDATE OR DELETE ON public.bank_transactions
FOR EACH ROW
EXECUTE FUNCTION public.update_bank_account_balance();

-- 2) Recreate balance lock trigger to lock balances after first transaction
DROP TRIGGER IF EXISTS trg_lock_balance_after_transaction ON public.bank_transactions;
CREATE TRIGGER trg_lock_balance_after_transaction
AFTER INSERT ON public.bank_transactions
FOR EACH ROW
EXECUTE FUNCTION public.lock_bank_account_balance_after_transaction();