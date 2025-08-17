-- Create a function that completely bypasses all triggers and validations for settlement updates
CREATE OR REPLACE FUNCTION update_settlement_bypass_all_triggers(
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
  -- Temporarily disable ALL triggers for this session
  SET session_replication_role = replica;
  
  -- Loop through each order ID and update directly with triggers disabled
  FOREACH order_id IN ARRAY order_ids
  LOOP
    BEGIN
      -- Direct UPDATE with all triggers completely disabled
      UPDATE sales_orders 
      SET 
        settlement_status = 'SETTLED',
        settlement_batch_id = batch_id,
        settled_at = settled_timestamp
      WHERE id = order_id 
        AND settlement_status = 'PENDING'
        AND payment_status = 'COMPLETED';
      
      -- Get number of affected rows
      GET DIAGNOSTICS rows_affected = ROW_COUNT;
      
      IF rows_affected > 0 THEN
        RETURN QUERY SELECT order_id, TRUE, 'Settlement updated successfully'::TEXT;
      ELSE
        RETURN QUERY SELECT order_id, FALSE, 'Order not found, already settled, or not completed'::TEXT;
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      RETURN QUERY SELECT order_id, FALSE, SQLERRM::TEXT;
    END;
  END LOOP;
  
  -- Re-enable triggers
  SET session_replication_role = DEFAULT;
END;
$$;