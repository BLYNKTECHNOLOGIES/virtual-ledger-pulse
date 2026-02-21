
-- Run cleanup as security definer function to bypass RLS
CREATE OR REPLACE FUNCTION cleanup_ghost_pending_settlements()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted int;
BEGIN
  -- Delete pending settlements where the order is already in a COMPLETED batch
  WITH to_delete AS (
    SELECT ps.id
    FROM pending_settlements ps
    WHERE ps.status = 'PENDING'
      AND EXISTS (
        SELECT 1
        FROM payment_gateway_settlement_items pgsi
        JOIN payment_gateway_settlements pgs ON pgs.id = pgsi.settlement_id
        WHERE pgsi.sales_order_id = ps.sales_order_id
          AND pgs.status = 'COMPLETED'
      )
  )
  DELETE FROM pending_settlements
  WHERE id IN (SELECT id FROM to_delete);
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Also fix sales_orders settlement_status
  UPDATE sales_orders so
  SET settlement_status = 'SETTLED'
  WHERE so.settlement_status = 'PENDING'
    AND EXISTS (
      SELECT 1
      FROM payment_gateway_settlement_items pgsi
      JOIN payment_gateway_settlements pgs ON pgs.id = pgsi.settlement_id
      WHERE pgsi.sales_order_id = so.id
        AND pgs.status = 'COMPLETED'
    )
    AND NOT EXISTS (
      SELECT 1 FROM pending_settlements ps
      WHERE ps.sales_order_id = so.id AND ps.status = 'PENDING'
    );

  RETURN v_deleted;
END;
$$;

-- Execute it
SELECT cleanup_ghost_pending_settlements();

-- Drop it after use
DROP FUNCTION cleanup_ghost_pending_settlements();
