
-- Remove ghost pending_settlements that already have COMPLETED settlement records
DELETE FROM pending_settlements ps
WHERE EXISTS (
  SELECT 1 FROM payment_gateway_settlement_items pgsi
  JOIN payment_gateway_settlements pgs ON pgs.id = pgsi.settlement_id
  WHERE pgsi.sales_order_id = ps.sales_order_id AND pgs.status = 'COMPLETED'
);
