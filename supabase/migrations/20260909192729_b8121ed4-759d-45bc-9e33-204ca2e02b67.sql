CREATE OR REPLACE FUNCTION public.match_chat_order_by_nickname(
  p_nickname text,
  p_account uuid,
  p_at timestamp with time zone
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH live_match AS (
    SELECT c.order_number,
           abs(extract(epoch FROM (p_at - to_timestamp((c.raw->>'createTime')::numeric / 1000.0)))) AS distance_seconds
      FROM public.terminal_active_orders_cache c
     WHERE p_nickname IS NOT NULL
       AND btrim(p_nickname) <> ''
       AND position('*' in p_nickname) = 0
       AND c.exchange_account_id IS NOT DISTINCT FROM p_account
       AND coalesce(c.raw->>'createTime', '') ~ '^[0-9]+$'
       AND to_timestamp((c.raw->>'createTime')::numeric / 1000.0) <= p_at + interval '10 minutes'
       AND to_timestamp((c.raw->>'createTime')::numeric / 1000.0) >= p_at - interval '48 hours'
       AND lower(btrim(
         CASE upper(coalesce(c.raw->>'tradeType', ''))
           WHEN 'SELL' THEN coalesce(c.raw->>'buyerNickname', c.raw->>'counterPartNickName', '')
           WHEN 'BUY' THEN coalesce(c.raw->>'sellerNickname', c.raw->>'counterPartNickName', '')
           ELSE coalesce(c.raw->>'counterPartNickName', c.raw->>'buyerNickname', c.raw->>'sellerNickname', '')
         END
       )) = lower(btrim(p_nickname))
     ORDER BY
       CASE WHEN coalesce(c.raw->>'orderStatus', '') IN ('1','2','5') THEN 0 ELSE 1 END,
       distance_seconds,
       (c.raw->>'createTime')::numeric DESC
     LIMIT 1
  ), history_match AS (
    SELECT h.order_number
      FROM public.binance_order_history h
     WHERE p_nickname IS NOT NULL
       AND btrim(p_nickname) <> ''
       AND position('*' in p_nickname) = 0
       AND lower(btrim(h.counter_part_nick_name)) = lower(btrim(p_nickname))
       AND h.exchange_account_id IS NOT DISTINCT FROM p_account
       AND h.create_time <= (extract(epoch from p_at) * 1000) + 600000
     ORDER BY
       CASE WHEN upper(coalesce(h.order_status, '')) IN ('TRADING','BUYER_PAYED','APPEAL') THEN 0 ELSE 1 END,
       abs(h.create_time - extract(epoch from p_at) * 1000),
       h.create_time DESC
     LIMIT 1
  )
  SELECT order_number FROM live_match
  UNION ALL
  SELECT order_number FROM history_match
   WHERE NOT EXISTS (SELECT 1 FROM live_match)
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.match_chat_order_by_nickname(text, uuid, timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_chat_order_by_nickname(text, uuid, timestamp with time zone) TO service_role;

CREATE OR REPLACE FUNCTION public.resolve_chat_thread_order_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  grp text;
  topic text;
  resolved text;
BEGIN
  IF NEW.sender_nickname IS NULL THEN
    NEW.sender_nickname := COALESCE(
      NEW.raw_payload->>'fromNickname',
      NEW.raw_payload->>'fromNickName',
      NEW.raw_payload->>'senderNickName',
      NEW.raw_payload->>'nickName');
  END IF;

  topic := COALESCE(NEW.raw_payload->>'topicId', NEW.raw_payload->>'orderNo');
  IF topic ~ '^[0-9]{18,22}$' THEN
    NEW.order_number := topic;
    RETURN NEW;
  END IF;

  -- Frames with no topic/order must follow the newest matching live order.
  -- Binance reuses groupId across orders, so groupId alone is not authoritative.
  resolved := public.match_chat_order_by_nickname(
    NEW.sender_nickname,
    NEW.exchange_account_id,
    COALESCE(NEW.binance_created_at, now())
  );
  IF resolved IS NOT NULL THEN
    NEW.order_number := resolved;
    RETURN NEW;
  END IF;

  -- Self/system frames often omit the counterparty nickname. For those only,
  -- use the most recent explicit order observed in the same Binance group.
  grp := COALESCE(NEW.raw_payload->>'groupId', substring(COALESCE(NEW.order_number, '') from 5));
  IF grp IS NOT NULL AND grp <> '' THEN
    SELECT m.order_number
      INTO resolved
      FROM public.binance_order_chat_messages m
     WHERE m.raw_payload->>'groupId' = grp
       AND m.order_number NOT LIKE 'INQ-%'
       AND m.exchange_account_id IS NOT DISTINCT FROM NEW.exchange_account_id
       AND m.binance_created_at <= COALESCE(NEW.binance_created_at, now()) + interval '10 minutes'
     ORDER BY m.binance_created_at DESC
     LIMIT 1;
    IF resolved IS NOT NULL THEN
      NEW.order_number := resolved;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

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
AS $$
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
      m.order_number, m.message_text, m.message_type, m.sender_is_self
    FROM public.binance_order_chat_messages m
    JOIN agg a ON a.order_number = m.order_number
    WHERE coalesce(m.is_system_message, false) = false
      AND coalesce(m.message_type, '') NOT IN ('system', 'card')
    ORDER BY m.order_number, m.binance_created_at DESC
  ),
  chat_name AS (
    SELECT DISTINCT ON (m.order_number)
      m.order_number, m.sender_nickname
    FROM public.binance_order_chat_messages m
    JOIN agg a ON a.order_number = m.order_number
    WHERE m.sender_is_self IS NOT TRUE
      AND coalesce(m.sender_nickname, '') <> ''
    ORDER BY m.order_number, m.binance_created_at DESC
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
    AND (p_search IS NULL OR p_search = ''
      OR e.order_number ILIKE '%' || p_search || '%'
      OR coalesce(e.counter_part_nick_name, '') ILIKE '%' || p_search || '%'
      OR coalesce(e.sender_nickname, '') ILIKE '%' || p_search || '%'
      OR coalesce(e.history_verified_name, '') ILIKE '%' || p_search || '%'
      OR coalesce(e.raw->>'buyerNickname', '') ILIKE '%' || p_search || '%'
      OR coalesce(e.raw->>'sellerNickname', '') ILIKE '%' || p_search || '%')
  ORDER BY e.last_message_at DESC NULLS LAST
  LIMIT greatest(coalesce(p_limit, 300), 1)
$$;

REVOKE ALL ON FUNCTION public.get_terminal_chat_inbox(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_terminal_chat_inbox(uuid, integer, text) TO authenticated, service_role;