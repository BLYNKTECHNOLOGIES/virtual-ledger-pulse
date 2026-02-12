-- Add default values so PostgREST accepts the insert; the BEFORE trigger overrides them
ALTER TABLE public.wallet_transactions ALTER COLUMN balance_before SET DEFAULT 0;
ALTER TABLE public.wallet_transactions ALTER COLUMN balance_after SET DEFAULT 0;