-- Fix the double addition by making the stock transaction creation idempotent
-- The issue is that the trigger fires on INSERT OR UPDATE, so if an order gets updated
-- from PENDING to COMPLETED, it creates a stock transaction again
CREATE OR REPLACE FUNCTION public.create_sales_stock_transaction()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Only create stock transaction if payment is completed and product_id exists
  -- AND no stock transaction already exists for this order
  IF NEW.payment_status = 'COMPLETED' AND NEW.product_id IS NOT NULL THEN
    
    -- Check if stock transaction already exists for this order
    IF NOT EXISTS (
      SELECT 1 FROM public.stock_transactions 
      WHERE reference_number = NEW.order_number 
        AND product_id = NEW.product_id
    ) THEN
      -- Create stock transaction
      INSERT INTO public.stock_transactions (
        product_id,
        transaction_type,
        quantity,
        unit_price,
        total_amount,
        transaction_date,
        supplier_customer_name,
        reference_number,
        reason
      ) VALUES (
        NEW.product_id,
        'Sales',
        -NEW.quantity, -- Negative for outgoing stock
        NEW.price_per_unit,
        NEW.total_amount,
        NEW.order_date::date,
        NEW.client_name,
        NEW.order_number,
        'Sales Order Transaction'
      );
    END IF;
    
  -- If wallet is specified but no product, create USDT stock transaction
  ELSIF NEW.payment_status = 'COMPLETED' AND NEW.wallet_id IS NOT NULL AND NEW.product_id IS NULL THEN
    -- Get USDT product ID
    DECLARE
      usdt_product_id UUID;
    BEGIN
      SELECT id INTO usdt_product_id FROM public.products WHERE code = 'USDT' LIMIT 1;
      
      IF usdt_product_id IS NOT NULL THEN
        -- Check if stock transaction already exists for this order
        IF NOT EXISTS (
          SELECT 1 FROM public.stock_transactions 
          WHERE reference_number = NEW.order_number 
            AND product_id = usdt_product_id
        ) THEN
          INSERT INTO public.stock_transactions (
            product_id,
            transaction_type,
            quantity,
            unit_price,
            total_amount,
            transaction_date,
            supplier_customer_name,
            reference_number,
            reason
          ) VALUES (
            usdt_product_id,
            'Sales',
            -NEW.quantity, -- Negative for outgoing stock
            NEW.price_per_unit,
            NEW.total_amount,
            NEW.order_date::date,
            NEW.client_name,
            NEW.order_number,
            'USDT Sales Order Transaction'
          );
        END IF;
      END IF;
    END;
  END IF;
  
  RETURN NEW;
END;
$function$;