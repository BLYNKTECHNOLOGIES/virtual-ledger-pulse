-- Drop warehouse-related tables entirely
DROP TABLE IF EXISTS warehouse_stock_movements CASCADE;
DROP TABLE IF EXISTS warehouses CASCADE;

-- Drop any warehouse-related functions
DROP FUNCTION IF EXISTS sync_product_warehouse_stock() CASCADE;

-- Update the sync_usdt_stock function to be the primary stock sync function
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
  
  -- Update USDT product stock to match wallet totals
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

-- Remove warehouse_id column from products table since we're moving to wallet-based system
ALTER TABLE products DROP COLUMN IF EXISTS warehouse_id;

-- Remove any warehouse stock related columns if they exist
ALTER TABLE products DROP COLUMN IF EXISTS warehouse_stock;