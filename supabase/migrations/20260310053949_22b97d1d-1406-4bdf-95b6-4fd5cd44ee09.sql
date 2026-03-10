
-- Create a one-time fix function to re-settle orders
CREATE OR REPLACE FUNCTION fix_settlement_status_once()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE sales_orders so
  SET settlement_status = 'SETTLED',
      settled_at = pgs.settlement_date
  FROM payment_gateway_settlement_items pgsi
  JOIN payment_gateway_settlements pgs ON pgs.id = pgsi.settlement_id
  WHERE pgsi.sales_order_id = so.id
    AND pgs.status = 'COMPLETED'
    AND so.settlement_status = 'PENDING';
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Execute it immediately
SELECT fix_settlement_status_once();

-- Drop it after use
DROP FUNCTION fix_settlement_status_once();
