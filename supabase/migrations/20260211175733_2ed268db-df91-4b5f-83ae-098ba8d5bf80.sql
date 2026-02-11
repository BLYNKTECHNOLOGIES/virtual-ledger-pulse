
-- Remove all existing pending terminal sync records so approval starts fresh from now
DELETE FROM terminal_sales_sync 
WHERE sync_status IN ('synced_pending_approval', 'client_mapping_pending');
