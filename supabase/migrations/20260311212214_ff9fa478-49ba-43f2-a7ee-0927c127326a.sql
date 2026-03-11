-- 1. Delete the contaminated masked nickname contact record
DELETE FROM counterparty_contact_records WHERE counterparty_nickname = 'Use***';

-- 2. Clear junk phone number from all clients
UPDATE clients SET phone = NULL WHERE phone = '8760098623';

-- 3. Clear from pending sales sync records
UPDATE terminal_sales_sync SET contact_number = NULL 
WHERE contact_number = '8760098623' 
AND sync_status IN ('client_mapping_pending', 'synced_pending_approval');