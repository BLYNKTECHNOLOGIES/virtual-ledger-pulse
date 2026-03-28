
-- =====================================================
-- Fix Bug L13: net_amount inconsistency on sales_orders
-- Auto-compute net_amount = total_amount - COALESCE(fee_amount, 0)
-- =====================================================

-- Step 1: Repair all existing sales_orders
UPDATE public.sales_orders
SET net_amount = total_amount - COALESCE(fee_amount, 0)
WHERE ABS(net_amount - (total_amount - COALESCE(fee_amount, 0))) > 0.01
  AND is_off_market = false;

-- For off-market orders, net_amount should also be total_amount - fee_amount
UPDATE public.sales_orders
SET net_amount = total_amount - COALESCE(fee_amount, 0)
WHERE ABS(net_amount - (total_amount - COALESCE(fee_amount, 0))) > 0.01
  AND is_off_market = true
  AND net_amount = 0;

-- Step 2: Create trigger to auto-compute net_amount on INSERT/UPDATE
CREATE OR REPLACE FUNCTION public.compute_sales_order_net_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.net_amount := COALESCE(NEW.total_amount, 0) - COALESCE(NEW.fee_amount, 0);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compute_sales_net_amount ON public.sales_orders;
CREATE TRIGGER trg_compute_sales_net_amount
  BEFORE INSERT OR UPDATE OF total_amount, fee_amount ON public.sales_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.compute_sales_order_net_amount();
