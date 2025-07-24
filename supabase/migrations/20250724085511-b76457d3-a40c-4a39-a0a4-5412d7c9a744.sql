-- Add chain_name column to wallets table
ALTER TABLE public.wallets 
ADD COLUMN chain_name TEXT;