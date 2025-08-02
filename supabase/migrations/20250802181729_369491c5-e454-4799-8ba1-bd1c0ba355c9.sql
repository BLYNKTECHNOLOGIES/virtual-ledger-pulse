-- First, let's ensure we have the correct transaction types for stock transactions
-- Update existing stock transactions from sales to have consistent type
UPDATE stock_transactions 
SET transaction_type = 'SALES_ORDER'
WHERE transaction_type = 'SALE' OR reference_number LIKE 'SO%' OR reference_number LIKE 'ORD-%';

-- Update any existing manual sales entries to have proper type
UPDATE stock_transactions 
SET transaction_type = 'SALES_ORDER'
WHERE reason = 'Manual Sales Entry' OR reason = 'Step-by-Step Sales Flow' OR reason = 'Sales Order';

-- Create a function to ensure stock transactions are created for sales orders
CREATE OR REPLACE FUNCTION create_sales_stock_transaction()
RETURNS TRIGGER AS $$
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
        'SALES_ORDER',
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
            'SALES_ORDER',
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
$$ LANGUAGE plpgsql;

-- Create trigger to automatically create stock transactions for sales orders
DROP TRIGGER IF EXISTS trigger_create_sales_stock_transaction ON sales_orders;
CREATE TRIGGER trigger_create_sales_stock_transaction
  AFTER INSERT OR UPDATE ON sales_orders
  FOR EACH ROW
  EXECUTE FUNCTION create_sales_stock_transaction();

-- Update the existing USDT sync function to be more robust
CREATE OR REPLACE FUNCTION sync_usdt_stock()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
$$;

-- Run the sync function to fix current stock inconsistencies
SELECT sync_usdt_stock();