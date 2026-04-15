
-- A. Populate client_verified_names from terminal_sales_sync
INSERT INTO public.client_verified_names (client_id, verified_name, source, first_seen_at, last_seen_at)
SELECT DISTINCT ON (tss.client_id, vname)
  tss.client_id,
  vname,
  'backfill',
  MIN(tss.synced_at) OVER (PARTITION BY tss.client_id, vname),
  MAX(tss.synced_at) OVER (PARTITION BY tss.client_id, vname)
FROM public.terminal_sales_sync tss,
LATERAL (SELECT (tss.order_data->>'verified_name')::text AS vname) v
WHERE tss.client_id IS NOT NULL
  AND tss.sync_status NOT IN ('rejected')
  AND vname IS NOT NULL
  AND vname != ''
  AND vname != 'Unknown'
ON CONFLICT (client_id, verified_name) DO UPDATE
  SET last_seen_at = GREATEST(client_verified_names.last_seen_at, EXCLUDED.last_seen_at);

-- Also from terminal_purchase_sync
INSERT INTO public.client_verified_names (client_id, verified_name, source, first_seen_at, last_seen_at)
SELECT DISTINCT ON (tps.client_id, vname)
  tps.client_id,
  vname,
  'backfill',
  MIN(tps.synced_at) OVER (PARTITION BY tps.client_id, vname),
  MAX(tps.synced_at) OVER (PARTITION BY tps.client_id, vname)
FROM public.terminal_purchase_sync tps,
LATERAL (SELECT (tps.order_data->>'verified_name')::text AS vname) v
WHERE tps.client_id IS NOT NULL
  AND tps.sync_status NOT IN ('rejected')
  AND vname IS NOT NULL
  AND vname != ''
  AND vname != 'Unknown'
ON CONFLICT (client_id, verified_name) DO UPDATE
  SET last_seen_at = GREATEST(client_verified_names.last_seen_at, EXCLUDED.last_seen_at);

-- B. Link orphaned unmasked nicknames from p2p_order_records to clients via sales sync
INSERT INTO public.client_binance_nicknames (client_id, nickname, source, last_seen_at)
SELECT DISTINCT ON (nick)
  tss.client_id,
  nick,
  'backfill',
  now()
FROM public.p2p_order_records por
JOIN public.terminal_sales_sync tss ON tss.binance_order_number = por.binance_order_number
CROSS JOIN LATERAL (SELECT por.counterparty_nickname AS nick) n
WHERE tss.client_id IS NOT NULL
  AND tss.sync_status NOT IN ('rejected')
  AND nick IS NOT NULL
  AND nick != ''
  AND nick NOT LIKE '%*%'
  AND NOT EXISTS (
    SELECT 1 FROM public.client_binance_nicknames cbn WHERE cbn.nickname = nick
  )
ON CONFLICT (nickname) DO NOTHING;

-- Also from purchase sync
INSERT INTO public.client_binance_nicknames (client_id, nickname, source, last_seen_at)
SELECT DISTINCT ON (nick)
  tps.client_id,
  nick,
  'backfill',
  now()
FROM public.p2p_order_records por
JOIN public.terminal_purchase_sync tps ON tps.binance_order_number = por.binance_order_number
CROSS JOIN LATERAL (SELECT por.counterparty_nickname AS nick) n
WHERE tps.client_id IS NOT NULL
  AND tps.sync_status NOT IN ('rejected')
  AND nick IS NOT NULL
  AND nick != ''
  AND nick NOT LIKE '%*%'
  AND NOT EXISTS (
    SELECT 1 FROM public.client_binance_nicknames cbn WHERE cbn.nickname = nick
  )
ON CONFLICT (nickname) DO NOTHING;

-- C. Backfill client_id on unmatched sales sync — ONLY where verified_name maps to exactly 1 client
UPDATE public.terminal_sales_sync tss
SET client_id = match.client_id,
    sync_status = CASE WHEN tss.sync_status = 'client_mapping_pending' THEN 'synced_pending_approval' ELSE tss.sync_status END
FROM (
  SELECT cvn.verified_name, cvn.client_id
  FROM public.client_verified_names cvn
  WHERE cvn.verified_name IN (
    SELECT cvn2.verified_name FROM public.client_verified_names cvn2
    GROUP BY cvn2.verified_name HAVING COUNT(DISTINCT cvn2.client_id) = 1
  )
) match
WHERE tss.client_id IS NULL
  AND tss.sync_status IN ('client_mapping_pending')
  AND (tss.order_data->>'verified_name') = match.verified_name;

-- Backfill client_id on unmatched purchase sync — same logic
UPDATE public.terminal_purchase_sync tps
SET client_id = match.client_id,
    sync_status = CASE WHEN tps.sync_status = 'client_mapping_pending' THEN 'synced_pending_approval' ELSE tps.sync_status END
FROM (
  SELECT cvn.verified_name, cvn.client_id
  FROM public.client_verified_names cvn
  WHERE cvn.verified_name IN (
    SELECT cvn2.verified_name FROM public.client_verified_names cvn2
    GROUP BY cvn2.verified_name HAVING COUNT(DISTINCT cvn2.client_id) = 1
  )
) match
WHERE tps.client_id IS NULL
  AND tps.sync_status IN ('client_mapping_pending')
  AND (tps.order_data->>'verified_name') = match.verified_name;
