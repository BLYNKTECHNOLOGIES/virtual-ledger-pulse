-- Add account_type column to bank_accounts table
ALTER TABLE public.bank_accounts 
ADD COLUMN account_type text NOT NULL DEFAULT 'SAVINGS';