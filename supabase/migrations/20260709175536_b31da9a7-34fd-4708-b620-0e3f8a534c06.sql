
DROP TABLE IF EXISTS public.cp_order_identity;
CREATE TABLE public.cp_order_identity AS
WITH our_ids AS (
  SELECT id FROM (
    SELECT order_detail_raw->>'merchantNo' AS id FROM binance_order_history WHERE order_detail_raw ? 'merchantNo'
    UNION ALL
    SELECT order_detail_raw->>'takerUserNo' FROM binance_order_history WHERE order_detail_raw ? 'takerUserNo'
  ) t WHERE id IS NOT NULL AND id <> '' GROUP BY id HAVING count(*) > 150
)
SELECT
  o.order_number,
  o.counter_part_nick_name AS nickname,
  o.order_status,
  nullif(o.total_price,'')::numeric AS total_price,
  o.create_time,
  o.verified_name,
  CASE
    WHEN (o.order_detail_raw->>'merchantNo') IN (SELECT id FROM our_ids) THEN o.order_detail_raw->>'takerUserNo'
    WHEN (o.order_detail_raw->>'takerUserNo') IN (SELECT id FROM our_ids) THEN o.order_detail_raw->>'merchantNo'
    ELSE NULL
  END AS cp_userno
FROM binance_order_history o
WHERE o.counter_part_nick_name IS NOT NULL
  AND o.order_detail_raw IS NOT NULL AND o.order_detail_raw <> '{}'::jsonb;

CREATE INDEX idx_cp_order_identity_nick ON public.cp_order_identity(nickname);
