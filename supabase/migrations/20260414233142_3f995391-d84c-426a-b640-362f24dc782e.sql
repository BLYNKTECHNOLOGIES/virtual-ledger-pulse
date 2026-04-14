-- Backfill from approved SALES sync via p2p_order_records (unmasked nicknames)
INSERT INTO public.client_binance_nicknames (client_id, nickname, source, first_seen_at, last_seen_at)
SELECT DISTINCT ON (por.counterparty_nickname)
  tss.client_id,
  por.counterparty_nickname,
  'backfill',
  MIN(tss.synced_at) OVER (PARTITION BY por.counterparty_nickname),
  MAX(tss.synced_at) OVER (PARTITION BY por.counterparty_nickname)
FROM terminal_sales_sync tss
JOIN p2p_order_records por ON por.binance_order_number = tss.binance_order_number
WHERE tss.client_id IS NOT NULL
  AND tss.sync_status = 'approved'
  AND por.counterparty_nickname IS NOT NULL
  AND por.counterparty_nickname NOT LIKE '%*%'
ORDER BY por.counterparty_nickname, tss.synced_at DESC
ON CONFLICT (nickname) DO NOTHING;

-- Backfill from approved PURCHASE sync via p2p_order_records (unmasked nicknames)
INSERT INTO public.client_binance_nicknames (client_id, nickname, source, first_seen_at, last_seen_at)
SELECT DISTINCT ON (por.counterparty_nickname)
  tps.client_id,
  por.counterparty_nickname,
  'backfill',
  MIN(tps.synced_at) OVER (PARTITION BY por.counterparty_nickname),
  MAX(tps.synced_at) OVER (PARTITION BY por.counterparty_nickname)
FROM terminal_purchase_sync tps
JOIN p2p_order_records por ON por.binance_order_number = tps.binance_order_number
WHERE tps.client_id IS NOT NULL
  AND tps.sync_status = 'approved'
  AND por.counterparty_nickname IS NOT NULL
  AND por.counterparty_nickname NOT LIKE '%*%'
ORDER BY por.counterparty_nickname, tps.synced_at DESC
ON CONFLICT (nickname) DO NOTHING;