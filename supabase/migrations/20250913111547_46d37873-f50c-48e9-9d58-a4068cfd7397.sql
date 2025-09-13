-- Fix the orphaned wallet transaction issue
-- Delete the orphaned wallet transaction since the sales order no longer exists
DELETE FROM wallet_transactions 
WHERE reference_type = 'SALES_ORDER' 
  AND reference_id = '92fee6cb-c7da-4efa-889d-7ca32b13b406'
  AND NOT EXISTS (
    SELECT 1 FROM sales_orders 
    WHERE id = wallet_transactions.reference_id
  );

-- Create a trigger to automatically clean up wallet transactions when sales orders are deleted
CREATE OR REPLACE FUNCTION cleanup_wallet_transactions_on_sales_order_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete associated wallet transactions when a sales order is deleted
  DELETE FROM wallet_transactions 
  WHERE reference_type = 'SALES_ORDER' 
    AND reference_id = OLD.id;
  
  RETURN OLD;
END;
$$;

-- Create the trigger if it doesn't exist
DROP TRIGGER IF EXISTS trigger_cleanup_wallet_transactions_on_sales_order_delete ON sales_orders;
CREATE TRIGGER trigger_cleanup_wallet_transactions_on_sales_order_delete
  AFTER DELETE ON sales_orders
  FOR EACH ROW
  EXECUTE FUNCTION cleanup_wallet_transactions_on_sales_order_delete();

-- Recalculate the affected wallet balance using our utility function
-- First get the wallet ID for the orphaned transaction
DO $$
DECLARE
  affected_wallet_id UUID;
BEGIN
  -- Get the wallet ID from the transaction we're about to delete
  SELECT wallet_id INTO affected_wallet_id 
  FROM wallet_transactions 
  WHERE reference_type = 'SALES_ORDER' 
    AND reference_id = '92fee6cb-c7da-4efa-889d-7ca32b13b406'
  LIMIT 1;
  
  -- If we found a wallet ID, recalculate its balance after cleanup
  IF affected_wallet_id IS NOT NULL THEN
    PERFORM recalculate_wallet_balance(affected_wallet_id);
  END IF;
END $$;