-- Add the missing balance_locked column to bank_accounts table
ALTER TABLE public.bank_accounts 
ADD COLUMN balance_locked BOOLEAN DEFAULT FALSE;