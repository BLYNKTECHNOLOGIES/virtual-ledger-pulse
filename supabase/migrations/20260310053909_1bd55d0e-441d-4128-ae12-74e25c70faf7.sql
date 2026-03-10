
-- One-time data fix: Mark the 782 sales orders that already have COMPLETED settlement records
UPDATE sales_orders so
SET settlement_status = 'SETTLED',
    settled_at = pgs.settlement_date
FROM payment_gateway_settlement_items pgsi
JOIN payment_gateway_settlements pgs ON pgs.id = pgsi.settlement_id
WHERE pgsi.sales_order_id = so.id
  AND pgs.status = 'COMPLETED'
  AND so.settlement_status = 'PENDING';
