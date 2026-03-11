-- Drop the misplaced buyer role trigger on sales_orders
-- It references clients columns (is_buyer, buyer_approval_status) that don't exist on sales_orders
DROP TRIGGER IF EXISTS check_buyer_role_trigger ON sales_orders;
DROP FUNCTION IF EXISTS check_client_buyer_role();