
-- B1: Fix purchase records matchable by name (excluding ambiguous names)
UPDATE public.terminal_purchase_sync tps
SET 
  client_id = c.id,
  sync_status = 'synced_pending_approval',
  resolved_via = 'name_match'
FROM public.clients c
WHERE tps.sync_status = 'client_mapping_pending'
  AND tps.client_id IS NULL
  AND LOWER(TRIM(tps.counterparty_name)) = LOWER(TRIM(c.name))
  AND c.is_deleted = false
  AND (SELECT COUNT(DISTINCT id) FROM public.clients c2 WHERE LOWER(TRIM(c2.name)) = LOWER(TRIM(tps.counterparty_name)) AND c2.is_deleted = false) = 1;

-- Clean up polluted "Unknown" nickname from client_binance_nicknames
DELETE FROM public.client_binance_nicknames WHERE nickname = 'Unknown';
