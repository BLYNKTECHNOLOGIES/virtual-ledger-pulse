-- Fix the product stock update trigger function
CREATE OR REPLACE FUNCTION public.update_product_stock_from_transaction()
RETURNS TRIGGER SET search_path = public AS $$
BEGIN
  -- Update product stock based on stock transaction
  UPDATE public.products 
  SET current_stock_quantity = current_stock_quantity + NEW.quantity,
      total_sales = CASE 
        WHEN NEW.transaction_type = 'Sales' THEN COALESCE(total_sales, 0) + ABS(NEW.quantity)
        ELSE total_sales
      END,
      updated_at = now()
  WHERE id = NEW.product_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS trigger_update_product_stock ON stock_transactions;
CREATE TRIGGER trigger_update_product_stock
    AFTER INSERT ON stock_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_product_stock_from_transaction();