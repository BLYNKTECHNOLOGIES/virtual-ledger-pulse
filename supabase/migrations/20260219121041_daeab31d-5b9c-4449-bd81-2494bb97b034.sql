
-- Clear stale contact_number values from terminal_sales_sync pending records
-- Contact number must only come from the actual client record, not stored sync data
UPDATE terminal_sales_sync
SET contact_number = NULL
WHERE contact_number IS NOT NULL
  AND sync_status IN ('synced_pending_approval', 'client_mapping_pending', 'pending');
