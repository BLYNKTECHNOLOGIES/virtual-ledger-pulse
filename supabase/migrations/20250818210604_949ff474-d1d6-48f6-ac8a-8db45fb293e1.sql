-- Fix the double addition issue in product stock updates
CREATE OR REPLACE FUNCTION public.update_product_stock_from_transaction()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Update product stock based on stock transaction
  -- For sales transactions, quantity is negative, so adding it reduces stock
  -- For purchase transactions, quantity is positive, so adding it increases stock
  UPDATE public.products 
  SET current_stock_quantity = current_stock_quantity + NEW.quantity,
      total_sales = CASE 
        WHEN NEW.transaction_type = 'Sales' THEN COALESCE(total_sales, 0) + ABS(NEW.quantity)
        ELSE COALESCE(total_sales, 0)
      END,
      updated_at = now()
  WHERE id = NEW.product_id;
  
  RETURN NEW;
END;
$function$;

-- Now fix the existing data by recalculating total_sales correctly
UPDATE public.products 
SET total_sales = (
  SELECT COALESCE(SUM(ABS(quantity)), 0)
  FROM public.stock_transactions 
  WHERE product_id = products.id 
    AND transaction_type = 'Sales'
)
WHERE id IN (
  SELECT DISTINCT product_id 
  FROM public.stock_transactions 
  WHERE transaction_type = 'Sales'
);