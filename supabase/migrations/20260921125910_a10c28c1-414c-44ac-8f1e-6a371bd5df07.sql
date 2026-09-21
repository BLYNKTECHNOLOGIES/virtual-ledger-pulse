CREATE OR REPLACE FUNCTION public.get_counterparty_recent_completed_orders(p_order_number text, p_exchange_account_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 5)
RETURNS TABLE(order_number text, trade_type text, asset text, amount text, total_price text, unit_price text, fiat_unit text, create_time bigint, exchange_account_id uuid)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT public.has_terminal_permission(auth.uid(), 'terminal_orders_view'::public.terminal_permission)
     AND NOT public.has_terminal_permission(auth.uid(), 'terminal_orders_chat'::public.terminal_permission)
     AND NOT public.has_terminal_permission(auth.uid(), 'terminal_orders_manage'::public.terminal_permission)
  THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  RETURN QUERY
  WITH cur AS (
    SELECT h.verified_name,
           h.order_detail_raw->>'merchantNo' AS merchant_no,
           h.order_detail_raw->>'takerUserNo' AS taker_user_no,
           (SELECT NULLIF(btrim(oi.cp_userno), '')
              FROM public.cp_order_identity oi
             WHERE oi.order_number = p_order_number
             LIMIT 1) AS identity_userno
      FROM public.binance_order_history h
     WHERE h.order_number = p_order_number
     LIMIT 1
  ),
  cp AS (
    SELECT COALESCE(
             (SELECT identity_userno FROM cur),
             CASE
               WHEN (SELECT merchant_no FROM cur) IS NOT NULL
                    AND (SELECT merchant_no FROM cur) NOT IN (SELECT merchant_no FROM public.cp_self_merchant_nos)
                 THEN (SELECT merchant_no FROM cur)
               ELSE (SELECT taker_user_no FROM cur)
             END
           ) AS cp_no,
           NULLIF(btrim((SELECT verified_name FROM cur)), '') AS cp_verified_name
  ),
  matched AS (
    SELECT oi.order_number
      FROM public.cp_order_identity oi
     WHERE (SELECT cp_no FROM cp) IS NOT NULL
       AND oi.cp_userno = (SELECT cp_no FROM cp)
       AND oi.order_status = 'COMPLETED'
       AND oi.order_number <> p_order_number
       AND (p_exchange_account_id IS NULL OR oi.exchange_account_id = p_exchange_account_id)
    UNION
    SELECT h.order_number
      FROM public.binance_order_history h
     WHERE (SELECT cp_no FROM cp) IS NOT NULL
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
    UNION
    SELECT oi.order_number
      FROM public.cp_order_identity oi
     WHERE (SELECT cp_no FROM cp) IS NULL
       AND (SELECT cp_verified_name FROM cp) IS NOT NULL
       AND oi.order_status = 'COMPLETED'
       AND oi.order_number <> p_order_number
       AND (p_exchange_account_id IS NULL OR oi.exchange_account_id = p_exchange_account_id)
       AND lower(btrim(coalesce(oi.verified_name, ''))) = lower((SELECT cp_verified_name FROM cp))
  )
  SELECT h.order_number, h.trade_type, h.asset, h.amount, h.total_price, h.unit_price,
         h.fiat_unit, h.create_time, h.exchange_account_id
    FROM public.binance_order_history h
   WHERE h.order_number IN (SELECT m.order_number FROM matched m)
     AND h.order_status = 'COMPLETED'
     AND (p_exchange_account_id IS NULL OR h.exchange_account_id = p_exchange_account_id)
   ORDER BY h.create_time DESC
   LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 5), 20));
END;
$function$;

REVOKE ALL ON FUNCTION public.get_counterparty_recent_completed_orders(text, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_counterparty_recent_completed_orders(text, uuid, integer) TO authenticated, service_role;