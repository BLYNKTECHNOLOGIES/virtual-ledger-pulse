CREATE OR REPLACE FUNCTION public.reconcile_binance_app_chat_reads(p_limit integer DEFAULT 500)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count int := 0;
BEGIN
  WITH zero AS (
    SELECT c.order_number, c.updated_at
    FROM public.terminal_active_orders_cache c
    WHERE coalesce((c.raw->>'chatUnreadCount')::int, (c.raw->>'chatUnread')::int, 0) = 0
      AND c.updated_at > now() - interval '30 minutes'
    ORDER BY c.updated_at DESC
    LIMIT greatest(coalesce(p_limit, 500), 1)
  ),
  needs AS (
    SELECT z.order_number, z.updated_at
    FROM zero z
    LEFT JOIN public.terminal_binance_chat_reads r ON r.order_number = z.order_number
    WHERE (r.last_read_at IS NULL OR r.last_read_at < z.updated_at)
      AND EXISTS (
        SELECT 1 FROM public.binance_order_chat_messages m
        WHERE m.order_number = z.order_number
          AND m.sender_is_self IS NOT TRUE
          AND coalesce(m.is_system_message, false) = false
          AND coalesce(m.message_type, '') NOT IN ('system','card')
          AND m.binance_created_at > coalesce(r.last_read_at, to_timestamp(0))
          AND m.binance_created_at <= z.updated_at
      )
  ),
  upsert AS (
    INSERT INTO public.terminal_binance_chat_reads (order_number, last_read_at, read_by_user_id, read_by_name, read_source)
    SELECT n.order_number, n.updated_at, NULL, 'Binance app', 'binance_app' FROM needs n
    ON CONFLICT (order_number) DO UPDATE
      SET last_read_at = EXCLUDED.last_read_at,
          read_by_user_id = NULL,
          read_by_name = 'Binance app',
          read_source = 'binance_app',
          updated_at = now()
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM upsert;

  RETURN v_count;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.reconcile_binance_app_chat_reads(integer) TO authenticated, service_role;