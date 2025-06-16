
-- First, make account_name unique in bank_accounts table
ALTER TABLE public.bank_accounts 
ADD CONSTRAINT unique_account_name UNIQUE (account_name);

-- Now update purchase_payment_methods table to use account_name as foreign key
ALTER TABLE public.purchase_payment_methods 
DROP CONSTRAINT IF EXISTS purchase_payment_methods_bank_account_id_fkey,
DROP CONSTRAINT IF EXISTS fk_purchase_payment_methods_bank_account,
DROP COLUMN IF EXISTS bank_account_id,
ADD COLUMN bank_account_name TEXT REFERENCES public.bank_accounts(account_name);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_purchase_payment_methods_bank_account_name 
ON public.purchase_payment_methods(bank_account_name);

-- Update existing records to use account_name instead of bank_account_id
-- This will set bank_account_name to NULL for existing records since we can't map the old IDs
UPDATE public.purchase_payment_methods SET bank_account_name = NULL;
