-- Backfill settlement_batch_id for existing 1,402 settled orders
UPDATE sales_orders so
SET settlement_batch_id = pgs.settlement_batch_id
FROM payment_gateway_settlement_items pgsi
JOIN payment_gateway_settlements pgs ON pgs.id = pgsi.settlement_id
WHERE so.id = pgsi.sales_order_id
  AND so.settlement_status = 'SETTLED'
  AND so.settlement_batch_id IS NULL
  AND pgs.status = 'COMPLETED';