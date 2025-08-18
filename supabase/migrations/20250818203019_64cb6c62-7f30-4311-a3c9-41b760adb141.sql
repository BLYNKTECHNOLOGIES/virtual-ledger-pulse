-- Remove the duplicate stock transaction trigger that's causing double entries
DROP TRIGGER IF EXISTS trigger_create_sales_stock_transaction ON sales_orders;