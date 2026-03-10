
-- Clean up duplicate payment splits for OFP000309
-- Keep only the latest set (created_at = '2026-03-09 19:37:41.936894+00')
DELETE FROM purchase_order_payment_splits
WHERE purchase_order_id = 'dc7e878b-47d8-422d-bd07-d9f06bc983a0'
  AND created_at < '2026-03-09 19:37:41.936894+00';
