
-- Reverse bulk approval: restore original statuses for records that were bulk-approved
-- Records WITH client_id were originally 'synced_pending_approval'
UPDATE terminal_sales_sync 
SET sync_status = 'synced_pending_approval', reviewed_at = NULL, reviewed_by = NULL
WHERE reviewed_by = 'system-bulk-approve' AND client_id IS NOT NULL;

-- Records WITHOUT client_id were originally 'client_mapping_pending'
UPDATE terminal_sales_sync 
SET sync_status = 'client_mapping_pending', reviewed_at = NULL, reviewed_by = NULL
WHERE reviewed_by = 'system-bulk-approve' AND client_id IS NULL;
