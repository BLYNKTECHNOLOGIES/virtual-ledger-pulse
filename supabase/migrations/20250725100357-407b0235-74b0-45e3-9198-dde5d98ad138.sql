-- Fix USDT sync function and manually sync current data
-- First, manually calculate and update USDT stock
UPDATE products 
SET current_stock_quantity = (
  SELECT COALESCE(SUM(current_balance), 0) 
  FROM wallets 
  WHERE is_active = true AND wallet_type = 'USDT'
),
updated_at = now()
WHERE code = 'USDT';

-- Fix the sync_usdt_stock function with proper permissions
CREATE OR REPLACE FUNCTION public.sync_usdt_stock()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  total_usdt_balance NUMERIC;
  usdt_product_id UUID;
BEGIN
  -- Calculate total USDT across all active wallets
  SELECT COALESCE(SUM(current_balance), 0) INTO total_usdt_balance
  FROM public.wallets 
  WHERE is_active = true AND wallet_type = 'USDT';
  
  -- Get USDT product ID
  SELECT id INTO usdt_product_id 
  FROM public.products 
  WHERE code = 'USDT';
  
  -- Update USDT product stock
  IF usdt_product_id IS NOT NULL THEN
    UPDATE public.products 
    SET current_stock_quantity = total_usdt_balance,
        updated_at = now()
    WHERE id = usdt_product_id;
  END IF;
END;
$function$;