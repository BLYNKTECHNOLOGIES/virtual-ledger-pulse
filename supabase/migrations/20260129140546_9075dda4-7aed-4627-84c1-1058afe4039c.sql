-- Fix: drop the non-negative product stock CHECK constraint that blocks purchase-order reversal deletions
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'products'
      AND c.conname = 'check_product_stock_non_negative'
  ) THEN
    EXECUTE 'ALTER TABLE public.products DROP CONSTRAINT check_product_stock_non_negative';
  END IF;
END $$;