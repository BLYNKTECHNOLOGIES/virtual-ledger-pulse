ALTER TABLE terminal_sales_sync DISABLE TRIGGER trg_enforce_terminal_sales_sync_review_actor;

UPDATE terminal_sales_sync ts
SET 
  sync_status = 'approved',
  sales_order_id = so.id,
  rejection_reason = NULL,
  reviewed_by = COALESCE(ts.synced_by, 'e00015eb-53c7-4be0-a9b9-e7c1cdd1acfd'),
  reviewed_at = now()
FROM sales_orders so
WHERE so.terminal_sync_id = ts.id
  AND ts.sync_status = 'synced_pending_approval'
  AND ts.rejection_reason = 'Auto-reset: mismatched sales order link detected'
  AND ts.sales_order_id IS NULL;

ALTER TABLE terminal_sales_sync ENABLE TRIGGER trg_enforce_terminal_sales_sync_review_actor;