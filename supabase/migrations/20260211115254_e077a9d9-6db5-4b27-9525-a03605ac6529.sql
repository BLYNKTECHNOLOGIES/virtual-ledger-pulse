
-- Add asset_code to wallet_transactions for multi-asset tracking per wallet
ALTER TABLE public.wallet_transactions 
ADD COLUMN IF NOT EXISTS asset_code text NOT NULL DEFAULT 'USDT';

-- Make wallet_type nullable since wallets are no longer tied to a single asset
ALTER TABLE public.wallets 
ALTER COLUMN wallet_type DROP NOT NULL;

ALTER TABLE public.wallets 
ALTER COLUMN wallet_type SET DEFAULT 'MULTI';

-- Update existing wallets to MULTI (they can hold any asset now)
-- Keep the existing value for reference but it's no longer functionally used
