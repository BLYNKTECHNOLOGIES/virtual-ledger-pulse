-- Create the most basic settlement update function possible
CREATE OR REPLACE FUNCTION update_settlement_raw(
  order_ids UUID[],
  batch_id TEXT,
  settled_timestamp TIMESTAMP WITH TIME ZONE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  order_id UUID;
  updated_count INTEGER := 0;
  result JSON;
BEGIN
  -- Simple loop to update each order
  FOREACH order_id IN ARRAY order_ids
  LOOP
    -- Raw update with no error handling
    UPDATE sales_orders 
    SET 
      settlement_status = 'SETTLED',
      settlement_batch_id = batch_id,
      settled_at = settled_timestamp
    WHERE id = order_id;
    
    IF FOUND THEN
      updated_count := updated_count + 1;
    END IF;
  END LOOP;
  
  -- Return simple JSON result
  result := json_build_object('updated_count', updated_count);
  RETURN result;
END;
$$;