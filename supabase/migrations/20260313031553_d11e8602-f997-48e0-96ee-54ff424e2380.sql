
-- Backfill purchase_orders.created_by from terminal_purchase_sync.synced_by
UPDATE purchase_orders po
SET created_by = tps.synced_by
FROM terminal_purchase_sync tps
JOIN users u ON u.id = tps.synced_by::uuid
WHERE tps.binance_order_number = po.order_number
  AND po.created_by IS NULL
  AND tps.synced_by IS NOT NULL
  AND po.source = 'terminal';

-- Backfill terminal_purchase_sync.reviewed_by
UPDATE terminal_purchase_sync tps2
SET reviewed_by = tps2.synced_by
FROM users u
WHERE u.id = tps2.synced_by::uuid
  AND tps2.reviewed_by IS NULL
  AND tps2.synced_by IS NOT NULL
  AND tps2.sync_status = 'approved';

-- Backfill sales orders (synced_by is text, created_by is uuid)
UPDATE sales_orders so
SET created_by = tss.synced_by::uuid
FROM terminal_sales_sync tss
JOIN users u ON u.id = tss.synced_by::uuid
WHERE tss.binance_order_number = so.order_number
  AND so.created_by IS NULL
  AND tss.synced_by IS NOT NULL
  AND so.source = 'terminal';
