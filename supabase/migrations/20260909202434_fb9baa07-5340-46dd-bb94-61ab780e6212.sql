CREATE OR REPLACE FUNCTION public.advance_terminal_chat_read_on_self_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_message_at timestamptz;
BEGIN
  IF NEW.sender_is_self IS NOT TRUE
     OR coalesce(NEW.is_system_message, false)
     OR coalesce(NEW.message_type, '') IN ('system', 'card') THEN
    RETURN NEW;
  END IF;

  v_message_at := coalesce(NEW.binance_created_at, now());

  INSERT INTO public.terminal_binance_chat_reads (
    order_number,
    last_read_at,
    read_by_user_id,
    read_by_name,
    read_source
  )
  VALUES (
    NEW.order_number,
    v_message_at,
    NULL,
    'Outgoing reply',
    'outgoing_message'
  )
  ON CONFLICT (order_number) DO UPDATE
    SET last_read_at = greatest(public.terminal_binance_chat_reads.last_read_at, excluded.last_read_at),
        read_by_name = CASE
          WHEN excluded.last_read_at >= public.terminal_binance_chat_reads.last_read_at
          THEN excluded.read_by_name
          ELSE public.terminal_binance_chat_reads.read_by_name
        END,
        read_source = CASE
          WHEN excluded.last_read_at >= public.terminal_binance_chat_reads.last_read_at
          THEN excluded.read_source
          ELSE public.terminal_binance_chat_reads.read_source
        END,
        updated_at = now();

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.advance_terminal_chat_read_on_self_message() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_terminal_chat_read_on_self_message() TO service_role;

DROP TRIGGER IF EXISTS trg_advance_terminal_chat_read_on_self_message ON public.binance_order_chat_messages;
CREATE TRIGGER trg_advance_terminal_chat_read_on_self_message
AFTER INSERT OR UPDATE OF sender_is_self, binance_created_at, is_system_message, message_type
ON public.binance_order_chat_messages
FOR EACH ROW
WHEN (NEW.sender_is_self IS TRUE)
EXECUTE FUNCTION public.advance_terminal_chat_read_on_self_message();

CREATE OR REPLACE FUNCTION public.get_terminal_chat_inbox(
  p_exchange_account_id uuid DEFAULT NULL::uuid,
  p_limit integer DEFAULT 300,
  p_search text DEFAULT NULL::text
)
RETURNS TABLE(
  order_number text,
  exchange_account_id uuid,
  counterparty_nickname text,
  verified_name text,
  trade_type text,
  asset text,
  fiat_unit text,
  amount text,
  total_price text,
  order_status text,
  create_time bigint,
  last_message_at timestamp with time zone,
  last_message_preview text,
  last_message_from_self boolean,
  unread_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  WITH message_bounds AS (
    SELECT
      m.order_number,
      max(m.exchange_account_id::text)::uuid AS exchange_account_id,
      max(m.binance_created_at) FILTER (
        WHERE coalesce(m.is_system_message, false) = false
          AND coalesce(m.message_type, '') NOT IN ('system', 'card')
      ) AS last_message_at,
      max(m.binance_created_at) FILTER (
        WHERE m.sender_is_self IS TRUE
          AND coalesce(m.is_system_message, false) = false
          AND coalesce(m.message_type, '') NOT IN ('system', 'card')
      ) AS last_self_message_at
    FROM public.binance_order_chat_messages m
    WHERE (p_exchange_account_id IS NULL OR m.exchange_account_id = p_exchange_account_id)
    GROUP BY m.order_number
  ),
  agg AS (
    SELECT
      b.order_number,
      b.exchange_account_id,
      b.last_message_at,
      count(*) FILTER (
        WHERE m.sender_is_self IS NOT TRUE
          AND coalesce(m.is_system_message, false) = false
          AND coalesce(m.message_type, '') NOT IN ('system', 'card')
          AND m.binance_created_at > greatest(
            coalesce(r.last_read_at, to_timestamp(0)),
            coalesce(b.last_self_message_at, to_timestamp(0))
          )
      )::int AS unread_count
    FROM message_bounds b
    JOIN public.binance_order_chat_messages m ON m.order_number = b.order_number
    LEFT JOIN public.terminal_binance_chat_reads r ON r.order_number = b.order_number
    GROUP BY b.order_number, b.exchange_account_id, b.last_message_at, b.last_self_message_at, r.last_read_at
  ),
  last_msg AS (
    SELECT DISTINCT ON (m.order_number)
      m.order_number, m.message_text, m.message_type, m.sender_is_self
    FROM public.binance_order_chat_messages m
    JOIN agg a ON a.order_number = m.order_number
    WHERE coalesce(m.is_system_message, false) = false
      AND coalesce(m.message_type, '') NOT IN ('system', 'card')
    ORDER BY m.order_number, m.binance_created_at DESC, m.updated_at DESC
  ),
  chat_name AS (
    SELECT DISTINCT ON (m.order_number)
      m.order_number, m.sender_nickname
    FROM public.binance_order_chat_messages m
    JOIN agg a ON a.order_number = m.order_number
    WHERE m.sender_is_self IS NOT TRUE
      AND coalesce(m.sender_nickname, '') <> ''
    ORDER BY m.order_number, m.binance_created_at DESC, m.updated_at DESC
  ),
  enriched AS (
    SELECT
      a.*,
      h.counter_part_nick_name,
      h.verified_name AS history_verified_name,
      h.trade_type AS history_trade_type,
      h.asset AS history_asset,
      h.fiat_unit AS history_fiat_unit,
      h.amount AS history_amount,
      h.total_price AS history_total_price,
      h.order_status AS history_order_status,
      h.create_time AS history_create_time,
      c.raw,
      lm.message_text,
      lm.message_type,
      lm.sender_is_self,
      cn.sender_nickname,
      coalesce(nullif(h.trade_type, ''), c.raw->>'tradeType', '') AS resolved_trade_type
    FROM agg a
    LEFT JOIN public.binance_order_history h ON h.order_number = a.order_number
    LEFT JOIN public.terminal_active_orders_cache c
      ON c.order_number = a.order_number
     AND c.exchange_account_id IS NOT DISTINCT FROM a.exchange_account_id
    LEFT JOIN last_msg lm ON lm.order_number = a.order_number
    LEFT JOIN chat_name cn ON cn.order_number = a.order_number
  )
  SELECT
    e.order_number,
    e.exchange_account_id,
    coalesce(
      nullif(e.counter_part_nick_name, ''),
      nullif(e.sender_nickname, ''),
      nullif(CASE upper(e.resolved_trade_type)
        WHEN 'SELL' THEN coalesce(e.raw->>'buyerNickname', e.raw->>'counterPartNickName')
        WHEN 'BUY' THEN coalesce(e.raw->>'sellerNickname', e.raw->>'counterPartNickName')
        ELSE coalesce(e.raw->>'counterPartNickName', e.raw->>'buyerNickname', e.raw->>'sellerNickname')
      END, ''),
      ''
    ) AS counterparty_nickname,
    coalesce(e.history_verified_name, '') AS verified_name,
    e.resolved_trade_type AS trade_type,
    coalesce(nullif(e.history_asset, ''), e.raw->>'asset', 'USDT') AS asset,
    coalesce(nullif(e.history_fiat_unit, ''), e.raw->>'fiat', 'INR') AS fiat_unit,
    coalesce(e.history_amount::text, e.raw->>'amount', '0') AS amount,
    coalesce(e.history_total_price::text, e.raw->>'totalPrice', '0') AS total_price,
    coalesce(
      CASE e.raw->>'orderStatus'
        WHEN '1' THEN 'TRADING'
        WHEN '2' THEN 'BUYER_PAYED'
        WHEN '3' THEN 'BUYER_PAYED'
        WHEN '4' THEN 'COMPLETED'
        WHEN '5' THEN 'APPEAL'
        WHEN '6' THEN 'CANCELLED'
        WHEN '7' THEN 'CANCELLED_BY_SYSTEM'
        ELSE NULL
      END,
      nullif(e.history_order_status, ''),
      ''
    ) AS order_status,
    coalesce(e.history_create_time, (e.raw->>'createTime')::bigint, (extract(epoch FROM e.last_message_at) * 1000)::bigint) AS create_time,
    e.last_message_at,
    CASE WHEN e.message_type = 'image' THEN '[Image]' ELSE left(coalesce(e.message_text, ''), 140) END AS last_message_preview,
    coalesce(e.sender_is_self, false) AS last_message_from_self,
    e.unread_count
  FROM enriched e
  WHERE e.last_message_at IS NOT NULL
    AND (auth.role() = 'service_role' OR public.can_view_orders(auth.uid()))
    AND (p_search IS NULL OR p_search = ''
      OR e.order_number ILIKE '%' || p_search || '%'
      OR coalesce(e.counter_part_nick_name, '') ILIKE '%' || p_search || '%'
      OR coalesce(e.sender_nickname, '') ILIKE '%' || p_search || '%'
      OR coalesce(e.history_verified_name, '') ILIKE '%' || p_search || '%'
      OR coalesce(e.raw->>'buyerNickname', '') ILIKE '%' || p_search || '%'
      OR coalesce(e.raw->>'sellerNickname', '') ILIKE '%' || p_search || '%')
  ORDER BY e.last_message_at DESC NULLS LAST
  LIMIT greatest(coalesce(p_limit, 300), 1)
$function$;

REVOKE ALL ON FUNCTION public.get_terminal_chat_inbox(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_terminal_chat_inbox(uuid, integer, text) TO authenticated, service_role;