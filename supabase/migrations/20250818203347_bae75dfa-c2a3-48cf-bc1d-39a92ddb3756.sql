-- Create a trigger function to update product stock when stock transactions are inserted
CREATE OR REPLACE FUNCTION public.update_product_stock_from_transaction()
RETURNS TRIGGER AS $$
BEGIN
  -- Update product stock based on stock transaction
  IF NEW.transaction_type = 'Purchase' THEN
    -- Increase stock for purchases (positive quantity)
    UPDATE public.products 
    SET current_stock_quantity = current_stock_quantity + NEW.quantity,
        updated_at = now()
    WHERE id = NEW.product_id;
  ELSIF NEW.transaction_type = 'Sales' THEN
    -- Decrease stock for sales (negative quantity already, so add it)
    UPDATE public.products 
    SET current_stock_quantity = current_stock_quantity + NEW.quantity,
        updated_at = now()
    WHERE id = NEW.product_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update product stock
DROP TRIGGER IF EXISTS trigger_update_product_stock ON stock_transactions;
CREATE TRIGGER trigger_update_product_stock
    AFTER INSERT ON stock_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_product_stock_from_transaction();