-- Update stock_transactions constraint to use 'Sales' instead of 'SALES_ORDER'
ALTER TABLE stock_transactions 
DROP CONSTRAINT IF EXISTS stock_transactions_transaction_type_check;

ALTER TABLE stock_transactions 
ADD CONSTRAINT stock_transactions_transaction_type_check 
CHECK (transaction_type IN ('PURCHASE', 'SALES', 'ADJUSTMENT', 'TRANSFER', 'Sales'));

-- Update existing SALES_ORDER records to 'Sales'
UPDATE stock_transactions 
SET transaction_type = 'Sales' 
WHERE transaction_type = 'SALES_ORDER';

-- Update the trigger function to use 'Sales' instead of 'SALES_ORDER'
CREATE OR REPLACE FUNCTION public.create_sales_stock_transaction()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Only create stock transaction if payment is completed and product/wallet is specified
  IF NEW.payment_status = 'COMPLETED' AND (NEW.product_id IS NOT NULL OR NEW.wallet_id IS NOT NULL) THEN
    
    -- If product is specified, create regular stock transaction
    IF NEW.product_id IS NOT NULL THEN
      INSERT INTO stock_transactions (
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
        'Sales', -- Changed from 'SALES_ORDER' to 'Sales'
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
    IF NEW.wallet_id IS NOT NULL AND NEW.product_id IS NULL THEN
      -- Get USDT product ID
      DECLARE
        usdt_product_id UUID;
      BEGIN
        SELECT id INTO usdt_product_id FROM products WHERE code = 'USDT' LIMIT 1;
        
        IF usdt_product_id IS NOT NULL THEN
          INSERT INTO stock_transactions (
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
            'Sales', -- Changed from 'SALES_ORDER' to 'Sales'
            -NEW.quantity, -- Negative for outgoing stock
            NEW.price_per_unit,
            NEW.total_amount,
            NEW.order_date::date,
            NEW.client_name,
            NEW.order_number,
            'USDT Sales Order Transaction'
          );
        END IF;
      END;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Force sync USDT stock to match current wallet balances
SELECT public.sync_usdt_stock();