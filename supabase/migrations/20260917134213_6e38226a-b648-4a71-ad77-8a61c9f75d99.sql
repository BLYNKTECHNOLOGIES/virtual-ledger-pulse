CREATE OR REPLACE FUNCTION public.get_counterparty_order_history(p_order_number text, p_exchange_account_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(order_number text, trade_type text, asset text, total_price text, fiat_unit text, create_time bigint, exchange_account_id uuid, order_status text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT public.has_terminal_permission(auth.uid(), 'terminal_orders_view'::public.terminal_permission)
     AND NOT public.has_terminal_permission(auth.uid(), 'terminal_admin'::public.terminal_permission)
  THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  RETURN QUERY
  WITH cur AS (
    SELECT i.cp_userno,
           CASE WHEN i.nickname IS NOT NULL AND btrim(i.nickname) <> '' AND i.nickname NOT LIKE '%*%'
                THEN btrim(i.nickname) END AS nickname
    FROM public.cp_order_identity i
    LEFT JOIN public.binance_order_history h ON h.order_number = i.order_number
    WHERE i.order_number = p_order_number
      AND (p_exchange_account_id IS NULL OR COALESCE(i.exchange_account_id, h.exchange_account_id) = p_exchange_account_id)
    LIMIT 1
  ),
  matched AS (
    SELECT i.order_number
    FROM public.cp_order_identity i
    JOIN cur c ON true
    LEFT JOIN public.binance_order_history h ON h.order_number = i.order_number
    WHERE i.order_number <> p_order_number
      AND (p_exchange_account_id IS NULL OR COALESCE(i.exchange_account_id, h.exchange_account_id) = p_exchange_account_id)
      AND ((c.cp_userno IS NOT NULL AND i.cp_userno = c.cp_userno)
        OR (c.cp_userno IS NULL AND c.nickname IS NOT NULL AND i.cp_userno IS NULL AND i.nickname = c.nickname))
  )
  SELECT h.order_number, h.trade_type, h.asset, h.total_price::text, h.fiat_unit,
         h.create_time, h.exchange_account_id, h.order_status
  FROM public.binance_order_history h
  WHERE h.order_number IN (SELECT m.order_number FROM matched m)
    AND (p_exchange_account_id IS NULL OR h.exchange_account_id = p_exchange_account_id)
  ORDER BY h.create_time DESC
  LIMIT 300;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_counterparty_order_history(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_counterparty_order_history(text, uuid) TO authenticated, service_role;