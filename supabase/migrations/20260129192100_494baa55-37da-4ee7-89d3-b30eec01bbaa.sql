-- Remove the check constraint that prevents negative bank balances
-- This is required to support transaction reversals per project requirements
ALTER TABLE public.bank_accounts DROP CONSTRAINT IF EXISTS check_bank_balance_non_negative;

-- Now delete orphaned Payment Gateway Settlement bank transactions 
DELETE FROM public.bank_transactions 
WHERE category = 'Payment Gateway Settlement' 
AND transaction_type = 'INCOME';