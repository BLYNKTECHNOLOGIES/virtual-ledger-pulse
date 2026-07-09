
DROP TABLE IF EXISTS public.cp_order_identity;
CREATE TABLE public.cp_order_identity AS
WITH our_ids AS (
  SELECT id FROM (
    SELECT order_detail_raw->>'merchantNo' AS id FROM binance_order_history WHERE order_detail_raw ? 'merchantNo'
    UNION ALL SELECT order_detail_raw->>'takerUserNo' FROM binance_order_history WHERE order_detail_raw ? 'takerUserNo'
  ) t WHERE id IS NOT NULL AND id<>'' GROUP BY id HAVING count(*)>150
),
base AS (
  SELECT o.order_number, o.order_status, nullif(o.total_price,'')::numeric AS total_price,
    o.create_time, o.verified_name, o.counter_part_nick_name AS masked_nick,
    (o.order_detail_raw->>'merchantNo') IN (SELECT id FROM our_ids) AS merch_ours,
    (o.order_detail_raw->>'takerUserNo') IN (SELECT id FROM our_ids) AS taker_ours,
    o.order_detail_raw->>'tradeType' AS trade_type,
    o.order_detail_raw->>'buyerNickname' AS buyer_nick,
    o.order_detail_raw->>'sellerNickname' AS seller_nick,
    o.order_detail_raw->>'merchantNo' AS merchant_no,
    o.order_detail_raw->>'takerUserNo' AS taker_no
  FROM binance_order_history o
  WHERE o.order_detail_raw IS NOT NULL AND o.order_detail_raw<>'{}'::jsonb
)
SELECT order_number, order_status, total_price, create_time, verified_name, masked_nick,
  CASE
    WHEN merch_ours THEN CASE WHEN trade_type='SELL' THEN buyer_nick ELSE seller_nick END
    WHEN taker_ours THEN CASE WHEN trade_type='SELL' THEN seller_nick ELSE buyer_nick END
    ELSE NULL
  END AS nickname,
  CASE WHEN merch_ours THEN taker_no WHEN taker_ours THEN merchant_no ELSE NULL END AS cp_userno
FROM base;

CREATE INDEX idx_cp_order_identity_nick ON public.cp_order_identity(nickname);
CREATE INDEX idx_cp_order_identity_userno ON public.cp_order_identity(cp_userno);
ALTER TABLE public.cp_order_identity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read cp identity" ON public.cp_order_identity FOR SELECT TO authenticated USING (true);
