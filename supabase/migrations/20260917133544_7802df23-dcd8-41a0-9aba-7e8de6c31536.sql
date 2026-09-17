CREATE OR REPLACE FUNCTION public.get_counterparty_completed_order_count(p_order_number text, p_cp_userno text DEFAULT NULL::text, p_exchange_account_id uuid DEFAULT NULL::uuid, p_verified_name text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH identity AS (
    SELECT COALESCE(
      NULLIF(btrim(p_cp_userno), ''),
      (
        SELECT NULLIF(btrim(oi.cp_userno), '')
        FROM public.cp_order_identity oi
        WHERE oi.order_number = p_order_number
        LIMIT 1
      )
    ) AS cp_userno
  ),
  cur AS (
    SELECT h.verified_name,
           h.order_detail_raw->>'merchantNo' AS merchant_no,
           h.order_detail_raw->>'takerUserNo' AS taker_user_no
    FROM public.binance_order_history h
    WHERE h.order_number = p_order_number
    LIMIT 1
  ),
  cp AS (
    SELECT COALESCE(
      (SELECT cp_userno FROM identity),
      CASE
        WHEN (SELECT merchant_no FROM cur) IS NOT NULL
             AND (SELECT merchant_no FROM cur) NOT IN (SELECT merchant_no FROM public.cp_self_merchant_nos)
          THEN (SELECT merchant_no FROM cur)
        ELSE (SELECT taker_user_no FROM cur)
      END
    ) AS cp_no,
    COALESCE(NULLIF(btrim(p_verified_name), ''), NULLIF(btrim((SELECT verified_name FROM cur)), '')) AS cp_verified_name
  ),
  -- Fast path: the indexed identity table already stores the resolved
  -- counterparty id, the order status and the account for every order.
  by_identity AS (
    SELECT count(*)::int AS cnt
    FROM public.cp_order_identity oi
    WHERE (SELECT cp_no FROM cp) IS NOT NULL
      AND oi.cp_userno = (SELECT cp_no FROM cp)
      AND oi.order_status = 'COMPLETED'
      AND oi.order_number <> p_order_number
      AND (p_exchange_account_id IS NULL OR oi.exchange_account_id = p_exchange_account_id)
  ),
  by_history AS (
    SELECT count(*)::int AS cnt
    FROM public.binance_order_history h
    WHERE (SELECT cp_no FROM cp) IS NOT NULL
      AND COALESCE((SELECT cnt FROM by_identity), 0) = 0
      AND h.order_status = 'COMPLETED'
      AND h.order_number <> p_order_number
      AND (p_exchange_account_id IS NULL OR h.exchange_account_id = p_exchange_account_id)
      AND (
        CASE
          WHEN (h.order_detail_raw->>'merchantNo') IS NOT NULL
               AND (h.order_detail_raw->>'merchantNo') NOT IN (SELECT merchant_no FROM public.cp_self_merchant_nos)
            THEN h.order_detail_raw->>'merchantNo'
          ELSE h.order_detail_raw->>'takerUserNo'
        END
      ) = (SELECT cp_no FROM cp)
  ),
  by_verified AS (
    SELECT count(*)::int AS cnt
    FROM public.cp_order_identity oi
    WHERE (SELECT cp_no FROM cp) IS NULL
      AND (SELECT cp_verified_name FROM cp) IS NOT NULL
      AND oi.order_status = 'COMPLETED'
      AND oi.order_number <> p_order_number
      AND (p_exchange_account_id IS NULL OR oi.exchange_account_id = p_exchange_account_id)
      AND lower(btrim(coalesce(oi.verified_name, ''))) = lower((SELECT cp_verified_name FROM cp))
  )
  SELECT CASE
    WHEN (SELECT cp_no FROM cp) IS NOT NULL
      THEN GREATEST(COALESCE((SELECT cnt FROM by_identity), 0), COALESCE((SELECT cnt FROM by_history), 0))
    WHEN (SELECT cp_verified_name FROM cp) IS NOT NULL THEN COALESCE((SELECT cnt FROM by_verified), 0)
    ELSE 0
  END;
$function$;

CREATE INDEX IF NOT EXISTS idx_cp_order_identity_userno_status ON public.cp_order_identity (cp_userno, order_status) WHERE cp_userno IS NOT NULL;