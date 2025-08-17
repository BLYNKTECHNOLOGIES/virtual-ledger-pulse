-- Create a function to update settlement status safely
CREATE OR REPLACE FUNCTION update_settlement_status_safe(
  order_ids UUID[],
  batch_id TEXT,
  settled_timestamp TIMESTAMP WITH TIME ZONE
)
RETURNS TABLE(updated_id UUID, success BOOLEAN, error_message TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
  order_id UUID;
BEGIN
  -- Loop through each order ID
  FOREACH order_id IN ARRAY order_ids
  LOOP
    BEGIN
      -- Update the sales order directly, bypassing any triggers that might cause constraint issues
      UPDATE sales_orders 
      SET 
        settlement_status = 'SETTLED',
        settlement_batch_id = batch_id,
        settled_at = settled_timestamp,
        updated_at = NOW()
      WHERE id = order_id 
        AND settlement_status = 'PENDING';
      
      -- Check if the update was successful
      IF FOUND THEN
        RETURN QUERY SELECT order_id, TRUE, NULL::TEXT;
      ELSE
        RETURN QUERY SELECT order_id, FALSE, 'Order not found or already settled'::TEXT;
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      -- If there's any error, return it but continue with other orders
      RETURN QUERY SELECT order_id, FALSE, SQLERRM::TEXT;
    END;
  END LOOP;
END;
$$;