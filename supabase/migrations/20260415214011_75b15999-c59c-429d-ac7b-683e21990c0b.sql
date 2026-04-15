
-- 1. Delete mislinked verified names (backfill errors)
DELETE FROM public.client_verified_names
WHERE id IN (
  SELECT cvn.id
  FROM public.client_verified_names cvn
  JOIN public.clients c ON c.id = cvn.client_id
  WHERE cvn.source = 'backfill'
    AND UPPER(TRIM(c.name)) != UPPER(TRIM(cvn.verified_name))
    AND EXISTS (
      SELECT 1 FROM public.client_verified_names other
      WHERE other.verified_name = cvn.verified_name
        AND other.client_id != cvn.client_id
    )
);

-- 2. Remove case-duplicate verified names per client
DELETE FROM public.client_verified_names
WHERE id IN (
  SELECT cvn.id
  FROM public.client_verified_names cvn
  WHERE cvn.source = 'backfill'
    AND EXISTS (
      SELECT 1 FROM public.client_verified_names other
      WHERE other.client_id = cvn.client_id
        AND other.id != cvn.id
        AND UPPER(TRIM(other.verified_name)) = UPPER(TRIM(cvn.verified_name))
        AND (other.source != 'backfill' OR other.created_at < cvn.created_at)
    )
);

-- 3. Link orphaned nicknames via verified names (no ON CONFLICT, guarded by NOT EXISTS)
INSERT INTO public.client_binance_nicknames (client_id, nickname, source, first_seen_at, last_seen_at)
SELECT DISTINCT ON (por.counterparty_nickname)
  cvn.client_id,
  por.counterparty_nickname,
  'backfill_v2',
  MIN(por.created_at),
  MAX(por.created_at)
FROM public.p2p_order_records por
JOIN public.binance_order_history boh ON boh.order_number = por.binance_order_number
JOIN public.client_verified_names cvn ON cvn.verified_name = boh.verified_name
WHERE por.counterparty_nickname IS NOT NULL
  AND por.counterparty_nickname NOT LIKE '%*%'
  AND boh.verified_name IS NOT NULL
  AND boh.verified_name != 'Unknown'
  AND (SELECT COUNT(DISTINCT client_id) FROM public.client_verified_names cv2 WHERE cv2.verified_name = boh.verified_name) = 1
  AND NOT EXISTS (
    SELECT 1 FROM public.client_binance_nicknames cbn
    WHERE cbn.nickname = por.counterparty_nickname
  )
GROUP BY por.counterparty_nickname, cvn.client_id;

-- 4. Fix pending sales records that match existing clients
UPDATE public.terminal_sales_sync tss
SET 
  client_id = c.id,
  sync_status = 'synced_pending_approval'
FROM public.clients c
WHERE tss.sync_status = 'client_mapping_pending'
  AND tss.client_id IS NULL
  AND LOWER(TRIM(tss.counterparty_name)) = LOWER(TRIM(c.name))
  AND c.is_deleted = false;
