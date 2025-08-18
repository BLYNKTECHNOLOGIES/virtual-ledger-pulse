-- Fix the trigger to only fire on INSERT, not UPDATE to prevent double entries
DROP TRIGGER IF EXISTS trigger_create_sales_bank_transaction ON sales_orders;

CREATE TRIGGER trigger_create_sales_bank_transaction
    AFTER INSERT ON sales_orders
    FOR EACH ROW
    EXECUTE FUNCTION create_sales_bank_transaction();