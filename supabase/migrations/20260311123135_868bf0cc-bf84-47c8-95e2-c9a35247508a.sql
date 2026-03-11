
-- Drop the duplicate/redundant trigger that's causing double balance updates
-- Keep trigger_update_bank_account_balance as it's more comprehensive
-- (handles TRANSFER_IN/TRANSFER_OUT, DELETE, and UPDATE)
DROP TRIGGER IF EXISTS trigger_lock_balance_after_transaction ON public.bank_transactions;
DROP FUNCTION IF EXISTS lock_bank_account_balance_after_transaction();
