-- Fix: drop the actual non-negative wallet balance CHECK constraint blocking purchase-order reversals
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'wallets'
      AND c.conname = 'wallets_balance_non_negative'
  ) THEN
    EXECUTE 'ALTER TABLE public.wallets DROP CONSTRAINT wallets_balance_non_negative';
  END IF;
END $$;