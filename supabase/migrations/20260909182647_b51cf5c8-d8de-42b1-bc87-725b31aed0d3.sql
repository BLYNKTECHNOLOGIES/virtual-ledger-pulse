CREATE OR REPLACE FUNCTION public.get_terminal_chat_inbox(p_exchange_account_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 300, p_search text DEFAULT NULL::text)
 RETURNS TABLE(order_number text, exchange_account_id uuid, counterparty_nickname text, verified_name text, trade_type text, asset text, fiat_unit text, amount text, total_price text, order_status text, create_time bigint, last_message_at timestamp with time zone, last_message_preview text, last_message_from_self boolean, unread_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH agg AS (
    SELECT
      m.order_number,
      max(m.exchange_account_id::text)::uuid AS exchange_account_id,
      max(m.binance_created_at) FILTER (
        WHERE coalesce(m.is_system_message, false) = false
          AND coalesce(m.message_type, '') NOT IN ('system', 'card')
      ) AS last_message_at,
      count(*) FILTER (
        WHERE m.sender_is_self IS NOT TRUE
          AND coalesce(m.is_system_message, false) = false
          AND coalesce(m.message_type, '') NOT IN ('system', 'card')
          AND m.binance_created_at > coalesce(r.last_read_at, to_timestamp(0))
      )::int AS unread_count
    FROM public.binance_order_chat_messages m
    LEFT JOIN public.terminal_binance_chat_reads r ON r.order_number = m.order_number
    WHERE (p_exchange_account_id IS NULL OR m.exchange_account_id = p_exchange_account_id)
    GROUP BY m.order_number, r.last_read_at, r.read_source
  ),
  last_msg AS (
    SELECT DISTINCT ON (m.order_number)
      m.order_number,
      m.message_text,
      m.message_type,
      m.sender_is_self
    FROM public.binance_order_chat_messages m
    JOIN agg a ON a.order_number = m.order_number
    WHERE coalesce(m.is_system_message, false) = false
      AND coalesce(m.message_type, '') NOT IN ('system', 'card')
    ORDER BY m.order_number, m.binance_created_at DESC
  ),
  chat_name AS (
    SELECT DISTINCT ON (m.order_number)
      m.order_number,
      m.sender_nickname
    FROM public.binance_order_chat_messages m
    JOIN agg a ON a.order_number = m.order_number
    WHERE m.sender_is_self IS NOT TRUE
      AND coalesce(m.sender_nickname, '') <> ''
    ORDER BY m.order_number, m.binance_created_at DESC
  )
  SELECT
    a.order_number,
    coalesce(a.exchange_account_id, h.exchange_account_id) AS exchange_account_id,
    coalesce(nullif(h.counter_part_nick_name, ''), cn.sender_nickname, '') AS counterparty_nickname,
    coalesce(h.verified_name, '') AS verified_name,
    coalesce(nullif(h.trade_type, ''), c.raw->>'tradeType', '') AS trade_type,
    coalesce(nullif(h.asset, ''), c.raw->>'asset', 'USDT') AS asset,
    coalesce(nullif(h.fiat_unit, ''), c.raw->>'fiat', 'INR') AS fiat_unit,
    coalesce(h.amount::text, c.raw->>'amount', '0') AS amount,
    coalesce(h.total_price::text, c.raw->>'totalPrice', '0') AS total_price,
    coalesce(
      nullif(h.order_status, ''),
      CASE c.raw->>'orderStatus'
        WHEN '1' THEN 'TRADING'
        WHEN '2' THEN 'BUYER_PAYED'
        WHEN '3' THEN 'BUYER_PAYED'
        WHEN '4' THEN 'COMPLETED'
        WHEN '5' THEN 'APPEAL'
        WHEN '6' THEN 'CANCELLED'
        WHEN '7' THEN 'CANCELLED_BY_SYSTEM'
        ELSE NULL
      END,
      ''
    ) AS order_status,
    coalesce(h.create_time, (c.raw->>'createTime')::bigint, (extract(epoch FROM a.last_message_at) * 1000)::bigint) AS create_time,
    a.last_message_at,
    CASE
      WHEN lm.message_type = 'image' THEN '[image]'
      ELSE left(coalesce(lm.message_text, ''), 140)
    END AS last_message_preview,
    coalesce(lm.sender_is_self, false) AS last_message_from_self,
    a.unread_count
  FROM agg a
  LEFT JOIN public.binance_order_history h ON h.order_number = a.order_number
  LEFT JOIN public.terminal_active_orders_cache c ON c.order_number = a.order_number
  LEFT JOIN last_msg lm ON lm.order_number = a.order_number
  LEFT JOIN chat_name cn ON cn.order_number = a.order_number
  WHERE a.last_message_at IS NOT NULL
    AND (p_search IS NULL OR p_search = ''
     OR a.order_number ILIKE '%' || p_search || '%'
     OR coalesce(h.counter_part_nick_name, '') ILIKE '%' || p_search || '%'
     OR coalesce(cn.sender_nickname, '') ILIKE '%' || p_search || '%'
     OR coalesce(h.verified_name, '') ILIKE '%' || p_search || '%')
  ORDER BY a.last_message_at DESC NULLS LAST
  LIMIT greatest(coalesce(p_limit, 300), 1);
$function$;