
CREATE OR REPLACE FUNCTION update_product_stock_from_transaction()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.transaction_type = 'IN' THEN
    UPDATE products SET current_stock_quantity = current_stock_quantity + NEW.quantity, updated_at = now()
    WHERE id = NEW.product_id;
  ELSIF NEW.transaction_type = 'OUT' THEN
    UPDATE products SET current_stock_quantity = current_stock_quantity - NEW.quantity, updated_at = now()
    WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
