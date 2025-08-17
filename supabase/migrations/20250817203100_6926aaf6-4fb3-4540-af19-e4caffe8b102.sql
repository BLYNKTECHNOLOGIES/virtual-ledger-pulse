-- Create a function that directly updates settlement status without triggering stock transactions
CREATE OR REPLACE FUNCTION update_settlement_status_direct(
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
  -- Loop through each order ID
  FOREACH order_id IN ARRAY order_ids
  LOOP
    BEGIN
      -- Direct UPDATE without any triggers that might create stock transactions
      UPDATE sales_orders 
      SET 
        settlement_status = 'SETTLED',
        settlement_batch_id = batch_id,
        settled_at = settled_timestamp,
        updated_at = NOW()
      WHERE id = order_id 
        AND settlement_status = 'PENDING'
        AND payment_status = 'COMPLETED';
      
      -- Get number of affected rows
      GET DIAGNOSTICS rows_affected = ROW_COUNT;
      
      IF rows_affected > 0 THEN
        RETURN QUERY SELECT order_id, TRUE, NULL::TEXT;
      ELSE
        RETURN QUERY SELECT order_id, FALSE, 'Order not found, already settled, or not completed'::TEXT;
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      -- If there's any error, return it but continue with other orders
      RETURN QUERY SELECT order_id, FALSE, SQLERRM::TEXT;
    END;
  END LOOP;
END;
$$;