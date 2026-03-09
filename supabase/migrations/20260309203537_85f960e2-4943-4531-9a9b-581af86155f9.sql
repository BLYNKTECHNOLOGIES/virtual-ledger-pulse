
-- Fix: missed deducting 1x ₹105,000 for SO-TRM-28183552 (7 entries deleted, only 6 deducted)
ALTER TABLE public.bank_transactions DISABLE TRIGGER trigger_update_bank_account_balance;

UPDATE public.bank_accounts 
SET balance = balance - 105000, updated_at = now()
WHERE id = 'df678cad-0b88-4bc9-b7a6-429ebd6b9604';

ALTER TABLE public.bank_transactions ENABLE TRIGGER trigger_update_bank_account_balance;
