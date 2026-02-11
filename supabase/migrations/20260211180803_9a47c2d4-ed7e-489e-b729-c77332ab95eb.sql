
-- Clear ALL pending terminal sales sync records (fresh start)
DELETE FROM terminal_sales_sync 
WHERE sync_status IN ('synced_pending_approval', 'client_mapping_pending');
