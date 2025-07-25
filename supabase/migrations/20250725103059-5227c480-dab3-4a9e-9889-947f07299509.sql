-- Fix the USDT stock sync function with better error handling and debugging
CREATE OR REPLACE FUNCTION public.sync_usdt_stock()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  total_usdt_balance NUMERIC;
  usdt_product_id UUID;
  wallet_count INTEGER;
BEGIN
  -- Calculate total USDT across all active wallets
  SELECT 
    COALESCE(SUM(current_balance), 0),
    COUNT(*)
  INTO total_usdt_balance, wallet_count
  FROM public.wallets 
  WHERE is_active = true AND wallet_type = 'USDT';
  
  -- Log the calculation for debugging
  RAISE NOTICE 'Found % active USDT wallets with total balance: %', wallet_count, total_usdt_balance;
  
  -- Get USDT product ID
  SELECT id INTO usdt_product_id 
  FROM public.products 
  WHERE code = 'USDT';
  
  -- Ensure we found the product
  IF usdt_product_id IS NULL THEN
    RAISE EXCEPTION 'USDT product not found';
  END IF;
  
  -- Update USDT product stock with explicit commit
  UPDATE public.products 
  SET 
    current_stock_quantity = total_usdt_balance,
    updated_at = now()
  WHERE id = usdt_product_id;
  
  -- Verify the update worked
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Failed to update USDT product stock';
  END IF;
  
  RAISE NOTICE 'Successfully updated USDT stock to: %', total_usdt_balance;
END;
$function$;

-- Force an immediate sync to fix current data
SELECT public.sync_usdt_stock();