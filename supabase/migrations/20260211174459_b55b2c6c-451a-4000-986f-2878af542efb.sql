-- Auto-approve all existing pending records so approval starts fresh from now
UPDATE terminal_sales_sync 
SET sync_status = 'approved', 
    reviewed_at = now(),
    reviewed_by = 'system-bulk-approve'
WHERE sync_status IN ('synced_pending_approval', 'client_mapping_pending');