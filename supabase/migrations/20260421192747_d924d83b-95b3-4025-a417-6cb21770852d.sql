UPDATE public.terminal_sales_sync
SET sync_status = 'synced_pending_approval',
    rejection_reason = NULL,
    reviewed_by = NULL,
    reviewed_at = NULL
WHERE id = 'ccd72492-d2c3-4229-81c8-a05a96e570b6';