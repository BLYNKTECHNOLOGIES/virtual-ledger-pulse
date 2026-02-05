
-- Add created_by column to wallet_transactions for tracking who performed each action
ALTER TABLE public.wallet_transactions 
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id);

-- Add an index for efficient lookups by creator
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created_by 
ON public.wallet_transactions(created_by);

-- Add comment for documentation
COMMENT ON COLUMN public.wallet_transactions.created_by IS 'User ID of the person who created/performed this transaction';
