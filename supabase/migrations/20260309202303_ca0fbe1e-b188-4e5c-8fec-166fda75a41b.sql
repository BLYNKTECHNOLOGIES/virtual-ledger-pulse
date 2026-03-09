
-- =====================================================
-- Phase 2: Add client_id FK to sales_orders for reliable matching
-- Step 1: Add nullable column with FK
-- Step 2: Backfill from clients table using name matching
-- Step 3: Update the monthly usage trigger to use client_id first
-- =====================================================

-- Add client_id column
ALTER TABLE public.sales_orders 
ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_sales_orders_client_id ON public.sales_orders(client_id);

-- Backfill existing orders with matching client IDs
UPDATE public.sales_orders so
SET client_id = c.id
FROM public.clients c
WHERE LOWER(TRIM(c.name)) = LOWER(TRIM(so.client_name))
AND so.client_id IS NULL
AND so.client_name IS NOT NULL;

-- Update the monthly usage trigger to prefer client_id, fallback to name
CREATE OR REPLACE FUNCTION public.update_client_monthly_usage_on_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only act when status changes to COMPLETED
  IF NEW.status = 'COMPLETED' AND (OLD IS NULL OR OLD.status != 'COMPLETED') THEN
    IF COALESCE(NEW.total_amount, 0) > 0 THEN
      IF NEW.client_id IS NOT NULL THEN
        UPDATE public.clients
        SET current_month_used = COALESCE(current_month_used, 0) + NEW.total_amount,
            updated_at = now()
        WHERE id = NEW.client_id;
      ELSIF NEW.client_name IS NOT NULL THEN
        UPDATE public.clients
        SET current_month_used = COALESCE(current_month_used, 0) + NEW.total_amount,
            updated_at = now()
        WHERE LOWER(TRIM(name)) = LOWER(TRIM(NEW.client_name));
      END IF;
    END IF;
  END IF;

  -- Handle status reverting FROM COMPLETED
  IF OLD IS NOT NULL AND OLD.status = 'COMPLETED' AND NEW.status != 'COMPLETED' THEN
    IF COALESCE(OLD.total_amount, 0) > 0 THEN
      IF NEW.client_id IS NOT NULL THEN
        UPDATE public.clients
        SET current_month_used = GREATEST(0, COALESCE(current_month_used, 0) - OLD.total_amount),
            updated_at = now()
        WHERE id = NEW.client_id;
      ELSIF NEW.client_name IS NOT NULL THEN
        UPDATE public.clients
        SET current_month_used = GREATEST(0, COALESCE(current_month_used, 0) - OLD.total_amount),
            updated_at = now()
        WHERE LOWER(TRIM(name)) = LOWER(TRIM(NEW.client_name));
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
