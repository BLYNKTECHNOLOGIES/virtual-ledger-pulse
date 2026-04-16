-- Reset the broken small sales sync entry so it can be re-approved
UPDATE small_sales_sync
SET sync_status = 'pending_approval',
    sales_order_id = NULL,
    reviewed_at = NULL,
    reviewed_by = NULL
WHERE id = '9906d3f2-4033-47d5-97ae-5965136a83b8';

-- Clean up orphaned batch valuation record
DELETE FROM batch_usdt_valuations
WHERE order_id = '41c20c54-69bd-4b2f-943a-49e7286384ae';