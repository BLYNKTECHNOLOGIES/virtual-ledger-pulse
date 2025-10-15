-- Use TRUNCATE to delete all data efficiently
-- CASCADE will handle foreign key relationships
-- RESTART IDENTITY will reset sequences

-- Truncate tables in order (child tables first due to foreign keys)
TRUNCATE TABLE public.wallet_transactions RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.stock_transactions RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.wallets RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.products RESTART IDENTITY CASCADE;