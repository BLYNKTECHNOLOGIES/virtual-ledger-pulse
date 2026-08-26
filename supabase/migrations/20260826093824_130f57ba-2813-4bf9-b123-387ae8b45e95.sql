CREATE OR REPLACE FUNCTION public.get_counterparty_completed_order_count(
  p_order_number text,
  p_cp_userno text DEFAULT NULL,
  p_exchange_account_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  WITH self_nos AS (
    SELECT merchant_no
    FROM (
      SELECT order_detail_raw->>'merchantNo' AS merchant_no,
             count(DISTINCT order_detail_raw->>'takerUserNo') AS takers
      FROM public.binance_order_history
      WHERE order_detail_raw ? 'merchantNo'
      GROUP BY 1
    ) d
    WHERE d.merchant_no IS NOT NULL
      AND d.takers >= 5
  ),
  cur_history AS (
    SELECT h.order_number,
           h.exchange_account_id,
           h.verified_name,
           h.counter_part_nick_name,
           h.order_detail_raw->>'merchantNo' AS merchant_no,
           h.order_detail_raw->>'takerUserNo' AS taker_user_no
    FROM public.binance_order_history h
    WHERE h.order_number = p_order_number
    LIMIT 1
  ),
  cur_active AS (
    SELECT p.binance_order_number AS order_number,
           p.exchange_account_id,
           NULL::text AS verified_name,
           p.counterparty_nickname AS counter_part_nick_name,
           NULL::text AS merchant_no,
           NULL::text AS taker_user_no
    FROM public.p2p_order_records p
    WHERE p.binance_order_number = p_order_number
    LIMIT 1
  ),
  cur AS (
    SELECT * FROM cur_history
    UNION ALL
    SELECT * FROM cur_active
    WHERE NOT EXISTS (SELECT 1 FROM cur_history)
    LIMIT 1
  ),
  identity AS (
    SELECT NULLIF(btrim(p_cp_userno), '') AS explicit_cp_userno
    UNION ALL
    SELECT NULLIF(btrim(oi.cp_userno), '')
    FROM public.cp_order_identity oi
    WHERE oi.order_number = p_order_number
      AND NULLIF(btrim(oi.cp_userno), '') IS NOT NULL
    LIMIT 1
  ),
  cp AS (
    SELECT COALESCE(
      (SELECT explicit_cp_userno FROM identity WHERE explicit_cp_userno IS NOT NULL LIMIT 1),
      CASE
        WHEN (SELECT merchant_no FROM cur) IS NOT NULL
             AND (SELECT merchant_no FROM cur) NOT IN (SELECT merchant_no FROM self_nos)
          THEN (SELECT merchant_no FROM cur)
        ELSE (SELECT taker_user_no FROM cur)
      END
    ) AS cp_no,
    NULLIF(btrim((SELECT verified_name FROM cur)), '') AS cp_verified_name,
    NULLIF(btrim((SELECT counter_part_nick_name FROM cur)), '') AS cp_nickname
  ),
  by_userno AS (
    SELECT count(*)::int AS cnt
    FROM public.binance_order_history h
    WHERE (SELECT cp_no FROM cp) IS NOT NULL
      AND h.order_status = 'COMPLETED'
      AND h.order_number <> p_order_number
      AND (p_exchange_account_id IS NULL OR h.exchange_account_id = p_exchange_account_id)
      AND (
        CASE
          WHEN (h.order_detail_raw->>'merchantNo') IS NOT NULL
               AND (h.order_detail_raw->>'merchantNo') NOT IN (SELECT merchant_no FROM self_nos)
            THEN h.order_detail_raw->>'merchantNo'
          ELSE h.order_detail_raw->>'takerUserNo'
        END
      ) = (SELECT cp_no FROM cp)
  ),
  by_verified AS (
    SELECT count(*)::int AS cnt
    FROM public.binance_order_history h
    WHERE (SELECT cp_no FROM cp) IS NULL
      AND (SELECT cp_verified_name FROM cp) IS NOT NULL
      AND h.order_status = 'COMPLETED'
      AND h.order_number <> p_order_number
      AND (p_exchange_account_id IS NULL OR h.exchange_account_id = p_exchange_account_id)
      AND lower(btrim(coalesce(h.verified_name, ''))) = lower((SELECT cp_verified_name FROM cp))
  )
  SELECT CASE
    WHEN (SELECT cp_no FROM cp) IS NOT NULL THEN COALESCE((SELECT cnt FROM by_userno), 0)
    WHEN (SELECT cp_verified_name FROM cp) IS NOT NULL THEN COALESCE((SELECT cnt FROM by_verified), 0)
    ELSE 0
  END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_counterparty_completed_order_count(text, text, uuid) TO authenticated, service_role;