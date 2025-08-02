-- Drop the constraint first
ALTER TABLE stock_transactions 
DROP CONSTRAINT IF EXISTS stock_transactions_transaction_type_check;

-- Check all existing transaction types
SELECT DISTINCT transaction_type, COUNT(*) as count FROM stock_transactions GROUP BY transaction_type;

-- Update trigger function to use 'Sales'
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
      END;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Sync USDT stock to current wallet balances
SELECT public.sync_usdt_stock();