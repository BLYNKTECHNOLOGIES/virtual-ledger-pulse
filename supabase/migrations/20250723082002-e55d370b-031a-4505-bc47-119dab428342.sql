-- Add account_status column to bank_accounts table if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bank_accounts' AND column_name = 'account_status') THEN
        ALTER TABLE public.bank_accounts ADD COLUMN account_status TEXT NOT NULL DEFAULT 'ACTIVE';
    END IF;
END $$;

-- Update existing records to have ACTIVE status where status is currently 'ACTIVE'
-- and CLOSED status where status is currently 'INACTIVE'
UPDATE public.bank_accounts 
SET account_status = CASE 
    WHEN status = 'ACTIVE' THEN 'ACTIVE'
    WHEN status = 'INACTIVE' THEN 'CLOSED'
    ELSE 'ACTIVE'
END;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_bank_accounts_account_status ON public.bank_accounts(account_status);