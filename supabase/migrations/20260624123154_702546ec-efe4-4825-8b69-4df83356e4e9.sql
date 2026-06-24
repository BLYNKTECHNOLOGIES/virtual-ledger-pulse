
-- Resolve the unmasked counterparty nickname from the saved Binance order detail.
-- For BUY orders our counterparty is the seller; for SELL orders, the buyer.
WITH resolved AS (
  SELECT
    order_number,
    NULLIF(
      CASE
        WHEN trade_type = 'BUY'  THEN order_detail_raw->>'sellerNickname'
        WHEN trade_type = 'SELL' THEN order_detail_raw->>'buyerNickname'
        ELSE NULL
      END, ''
    ) AS unmasked
  FROM public.binance_order_history
  WHERE order_detail_raw IS NOT NULL
)
UPDATE public.binance_order_history b
SET counter_part_nick_name = r.unmasked
FROM resolved r
WHERE b.order_number = r.order_number
  AND r.unmasked IS NOT NULL
  AND r.unmasked NOT LIKE '%*%'
  AND lower(r.unmasked) <> 'unknown'
  AND (b.counter_part_nick_name IS NULL
       OR b.counter_part_nick_name LIKE '%*%'
       OR b.counter_part_nick_name = ''
       OR b.counter_part_nick_name <> r.unmasked);

-- Propagate the same unmasked nickname into p2p_order_records,
-- which is what the buyer/seller approval screens read from.
WITH resolved AS (
  SELECT
    order_number,
    NULLIF(
      CASE
        WHEN trade_type = 'BUY'  THEN order_detail_raw->>'sellerNickname'
        WHEN trade_type = 'SELL' THEN order_detail_raw->>'buyerNickname'
        ELSE NULL
      END, ''
    ) AS unmasked
  FROM public.binance_order_history
  WHERE order_detail_raw IS NOT NULL
)
UPDATE public.p2p_order_records p
SET counterparty_nickname = r.unmasked
FROM resolved r
WHERE p.binance_order_number = r.order_number
  AND r.unmasked IS NOT NULL
  AND r.unmasked NOT LIKE '%*%'
  AND lower(r.unmasked) <> 'unknown'
  AND (p.counterparty_nickname IS NULL
       OR p.counterparty_nickname LIKE '%*%'
       OR p.counterparty_nickname = ''
       OR p.counterparty_nickname <> r.unmasked);
