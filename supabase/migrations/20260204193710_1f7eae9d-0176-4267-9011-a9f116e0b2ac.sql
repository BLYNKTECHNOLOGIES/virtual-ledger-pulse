-- Add dormant tracking fields to bank_accounts table
ALTER TABLE public.bank_accounts
ADD COLUMN IF NOT EXISTS dormant_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS dormant_by UUID DEFAULT NULL;

-- Add foreign key constraint for dormant_by
ALTER TABLE public.bank_accounts
ADD CONSTRAINT bank_accounts_dormant_by_fkey 
FOREIGN KEY (dormant_by) 
REFERENCES auth.users(id);

-- Create index for efficient dormant filtering
CREATE INDEX IF NOT EXISTS idx_bank_accounts_dormant 
ON public.bank_accounts(status, dormant_at);

-- Add comment for documentation
COMMENT ON COLUMN public.bank_accounts.dormant_at IS 'Timestamp when the account was marked as dormant. NULL means active.';
COMMENT ON COLUMN public.bank_accounts.dormant_by IS 'User ID who marked the account as dormant.';