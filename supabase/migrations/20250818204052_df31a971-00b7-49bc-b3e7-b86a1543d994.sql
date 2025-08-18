-- Create a trigger function to create stock transactions for completed sales orders
CREATE OR REPLACE FUNCTION public.create_sales_stock_transaction()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create stock transaction if payment is completed and product_id exists
  IF NEW.payment_status = 'COMPLETED' AND NEW.product_id IS NOT NULL THEN
    
    -- If product is specified, create stock transaction
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
    
  -- If wallet is specified but no product, create USDT stock transaction
  ELSIF NEW.payment_status = 'COMPLETED' AND NEW.wallet_id IS NOT NULL AND NEW.product_id IS NULL THEN
    -- Get USDT product ID
    DECLARE
      usdt_product_id UUID;
    BEGIN
      SELECT id INTO usdt_product_id FROM public.products WHERE code = 'USDT' LIMIT 1;
      
      IF usdt_product_id IS NOT NULL THEN
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
    END;
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