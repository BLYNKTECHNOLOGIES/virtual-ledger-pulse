-- Add lien_amount column to bank_accounts table
ALTER TABLE public.bank_accounts 
ADD COLUMN IF NOT EXISTS lien_amount numeric DEFAULT 0 NOT NULL;

-- Add comment to explain the field
COMMENT ON COLUMN public.bank_accounts.lien_amount IS 'Amount under lien/hold. Total Balance = Lien Amount + Available Balance';

-- Update existing records to have 0 lien amount
UPDATE public.bank_accounts 
SET lien_amount = 0 
WHERE lien_amount IS NULL;