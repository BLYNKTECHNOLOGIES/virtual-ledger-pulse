
-- Force cleanup: remove ghost pending records for orders already in completed settlements
DELETE FROM pending_settlements ps
USING (
  SELECT DISTINCT pgsi.sales_order_id
  FROM payment_gateway_settlement_items pgsi
  JOIN payment_gateway_settlements pgs ON pgs.id = pgsi.settlement_id
  WHERE pgs.status = 'COMPLETED'
) completed
WHERE ps.sales_order_id = completed.sales_order_id
  AND ps.status = 'PENDING';

-- Fix their sales_orders status too
UPDATE sales_orders so
SET settlement_status = 'SETTLED'
FROM (
  SELECT DISTINCT pgsi.sales_order_id
  FROM payment_gateway_settlement_items pgsi
  JOIN payment_gateway_settlements pgs ON pgs.id = pgsi.settlement_id
  WHERE pgs.status = 'COMPLETED'
) completed
WHERE so.id = completed.sales_order_id
  AND so.settlement_status = 'PENDING';
