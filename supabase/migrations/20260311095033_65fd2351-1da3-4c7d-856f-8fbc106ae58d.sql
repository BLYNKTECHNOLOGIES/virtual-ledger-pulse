
-- Drop the misplaced trigger on purchase_orders
DROP TRIGGER IF EXISTS check_seller_role_trigger ON purchase_orders;

-- Drop the function if no longer needed
DROP FUNCTION IF EXISTS check_client_seller_role();
