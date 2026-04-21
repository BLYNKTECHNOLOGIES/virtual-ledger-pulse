UPDATE public.terminal_purchase_sync
SET sync_status = 'rejected',
    rejection_reason = 'Past-day stale entry — bulk cleanup',
    reviewed_by = '6a678004-e337-4590-a6dc-2432bfe3451a',
    reviewed_at = now()
WHERE sync_status IN ('synced_pending_approval', 'client_mapping_pending');

UPDATE public.terminal_sales_sync
SET sync_status = 'rejected',
    rejection_reason = 'Past-day stale entry — bulk cleanup',
    reviewed_by = '6a678004-e337-4590-a6dc-2432bfe3451a',
    reviewed_at = now()
WHERE sync_status IN ('synced_pending_approval', 'client_mapping_pending');

UPDATE public.small_buys_sync
SET sync_status = 'rejected',
    rejection_reason = 'Past-day stale entry — bulk cleanup',
    reviewed_by = 'GMblynk001',
    reviewed_at = now()
WHERE sync_status IN ('pending_approval', 'synced_pending_approval');

UPDATE public.small_sales_sync
SET sync_status = 'rejected',
    rejection_reason = 'Past-day stale entry — bulk cleanup',
    reviewed_by = 'GMblynk001',
    reviewed_at = now()
WHERE sync_status IN ('pending_approval', 'synced_pending_approval');