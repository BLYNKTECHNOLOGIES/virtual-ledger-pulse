
-- Fix: add missing transaction_date to create_sales_stock_transaction trigger
-- Also fix the older version from migration 20260309 that uses 'notes' instead of 'reason'

CREATE OR REPLACE FUNCTION public.create_sales_stock_transaction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_count INT;
  v_product_name TEXT;
BEGIN
  IF NEW.status = 'COMPLETED' AND NEW.product_id IS NOT NULL AND (NEW.quantity IS NOT NULL AND NEW.quantity > 0) THEN
    -- IDEMPOTENCY: Check if stock transaction already exists
    SELECT COUNT(*) INTO v_existing_count
    FROM public.stock_transactions
    WHERE reference_number = NEW.order_number
    AND transaction_type = 'Sales';
    
    IF v_existing_count > 0 THEN
      RETURN NEW;
    END IF;

    SELECT name INTO v_product_name FROM public.products WHERE id = NEW.product_id;
    
    INSERT INTO public.stock_transactions (
      product_id, transaction_type, quantity, unit_price,
      total_amount, reference_number, reason, transaction_date
    ) VALUES (
      NEW.product_id, 'Sales', -(NEW.quantity),
      COALESCE(NEW.price_per_unit, 0), COALESCE(NEW.total_amount, 0),
      NEW.order_number,
      'Sales Order - ' || NEW.order_number || ' - ' || COALESCE(NEW.client_name, ''),
      COALESCE(NEW.order_date::date, CURRENT_DATE)
    );
  END IF;
  
  RETURN NEW;
END;
$function$;
