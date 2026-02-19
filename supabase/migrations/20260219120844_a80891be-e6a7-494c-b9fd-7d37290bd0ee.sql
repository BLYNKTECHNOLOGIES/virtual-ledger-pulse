
-- Clear stale state values from terminal_sales_sync records that are still pending approval
-- State should NEVER be stored on sync records — it belongs only on the client record
-- Only clear records that are not yet approved (pending approval or pending mapping)
UPDATE terminal_sales_sync
SET state = NULL
WHERE state IS NOT NULL
  AND sync_status IN ('synced_pending_approval', 'client_mapping_pending', 'pending');
