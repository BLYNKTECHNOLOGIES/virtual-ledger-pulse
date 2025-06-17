
-- Add bank_account_holder_name column to bank_accounts table
ALTER TABLE public.bank_accounts 
ADD COLUMN bank_account_holder_name TEXT;
