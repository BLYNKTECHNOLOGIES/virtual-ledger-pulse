-- Fix: Change AFTER UPDATE to BEFORE UPDATE so NEW.updated_at assignment takes effect
DROP TRIGGER IF EXISTS purchase_order_status_change_trigger ON purchase_orders;

CREATE TRIGGER purchase_order_status_change_trigger
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION track_purchase_order_status_change();