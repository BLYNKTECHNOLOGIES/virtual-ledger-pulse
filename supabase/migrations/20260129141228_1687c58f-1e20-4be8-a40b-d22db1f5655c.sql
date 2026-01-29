-- Fix: Add ON DELETE CASCADE to wallet foreign key constraints

-- Drop and recreate wallet_transactions FK with CASCADE
ALTER TABLE public.wallet_transactions
  DROP CONSTRAINT IF EXISTS wallet_transactions_wallet_id_fkey;

ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT wallet_transactions_wallet_id_fkey
  FOREIGN KEY (wallet_id) REFERENCES public.wallets(id) ON DELETE CASCADE;

-- Drop and recreate sales_orders wallet FK with SET NULL (orders should remain, just unlink wallet)
ALTER TABLE public.sales_orders
  DROP CONSTRAINT IF EXISTS sales_orders_wallet_id_fkey;

ALTER TABLE public.sales_orders
  ADD CONSTRAINT sales_orders_wallet_id_fkey
  FOREIGN KEY (wallet_id) REFERENCES public.wallets(id) ON DELETE SET NULL;