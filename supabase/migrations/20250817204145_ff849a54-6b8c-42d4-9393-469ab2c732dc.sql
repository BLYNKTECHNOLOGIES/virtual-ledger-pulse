-- Create a function that ONLY updates settlement status fields - no business logic
CREATE OR REPLACE FUNCTION update_settlement_status_only(
  order_ids UUID[],
  batch_id TEXT,
  settled_timestamp TIMESTAMP WITH TIME ZONE
)
RETURNS TABLE(updated_id UUID, success BOOLEAN, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  order_id UUID;
  rows_affected INTEGER;
BEGIN
  -- Loop through each order ID and update ONLY settlement fields
  FOREACH order_id IN ARRAY order_ids
  LOOP
    BEGIN
      -- Direct UPDATE of ONLY settlement status fields - no other changes
      UPDATE sales_orders 
      SET 
        settlement_status = 'SETTLED',
        settlement_batch_id = batch_id,
        settled_at = settled_timestamp
      -- Don't update updated_at as it might trigger other logic
      WHERE id = order_id 
        AND settlement_status = 'PENDING'
        AND payment_status = 'COMPLETED';
      
      -- Get number of affected rows
      GET DIAGNOSTICS rows_affected = ROW_COUNT;
      
      IF rows_affected > 0 THEN
        RETURN QUERY SELECT order_id, TRUE, 'Settlement status updated successfully'::TEXT;
      ELSE
        RETURN QUERY SELECT order_id, FALSE, 'Order not found, already settled, or not completed'::TEXT;
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      -- If there's any error, log it but continue with other orders
      RETURN QUERY SELECT order_id, FALSE, SQLERRM::TEXT;
    END;
  END LOOP;
END;
$$;