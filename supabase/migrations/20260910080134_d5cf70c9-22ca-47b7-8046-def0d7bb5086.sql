CREATE TABLE IF NOT EXISTS public.terminal_chat_thread_summary (
  order_number text PRIMARY KEY,
  exchange_account_id uuid,
  last_message_at timestamptz,
  last_self_message_at timestamptz,
  last_message_text text,
  last_message_type text,
  last_message_from_self boolean,
  counterparty_nickname text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.terminal_chat_thread_summary TO authenticated;
GRANT ALL ON public.terminal_chat_thread_summary TO service_role;

ALTER TABLE public.terminal_chat_thread_summary ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS terminal_chat_thread_summary_select ON public.terminal_chat_thread_summary;
CREATE POLICY terminal_chat_thread_summary_select
  ON public.terminal_chat_thread_summary
  FOR SELECT TO authenticated
  USING (public.can_view_orders(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_tcts_last_message_at
  ON public.terminal_chat_thread_summary (last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_tcts_account_last_message
  ON public.terminal_chat_thread_summary (exchange_account_id, last_message_at DESC NULLS LAST);

CREATE OR REPLACE FUNCTION public.refresh_terminal_chat_thread_summary(p_order text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  INSERT INTO public.terminal_chat_thread_summary AS s (
    order_number, exchange_account_id, last_message_at, last_self_message_at,
    last_message_text, last_message_type, last_message_from_self,
    counterparty_nickname, updated_at
  )
  SELECT
    p_order,
    (SELECT max(m.exchange_account_id::text)::uuid
       FROM public.binance_order_chat_messages m WHERE m.order_number = p_order),
    (SELECT max(m.binance_created_at)
       FROM public.binance_order_chat_messages m
      WHERE m.order_number = p_order
        AND coalesce(m.is_system_message, false) = false
        AND coalesce(m.message_type, '') NOT IN ('system','card')),
    (SELECT max(m.binance_created_at)
       FROM public.binance_order_chat_messages m
      WHERE m.order_number = p_order
        AND m.sender_is_self IS TRUE
        AND coalesce(m.is_system_message, false) = false
        AND coalesce(m.message_type, '') NOT IN ('system','card')),
    lm.message_text, lm.message_type, lm.sender_is_self,
    cn.sender_nickname, now()
  FROM (SELECT 1) x
  LEFT JOIN LATERAL (
    SELECT m.message_text, m.message_type, m.sender_is_self
      FROM public.binance_order_chat_messages m
     WHERE m.order_number = p_order
       AND coalesce(m.is_system_message, false) = false
       AND coalesce(m.message_type, '') NOT IN ('system','card')
     ORDER BY m.binance_created_at DESC NULLS LAST, m.updated_at DESC
     LIMIT 1
  ) lm ON true
  LEFT JOIN LATERAL (
    SELECT m.sender_nickname
      FROM public.binance_order_chat_messages m
     WHERE m.order_number = p_order
       AND m.sender_is_self IS NOT TRUE
       AND coalesce(m.sender_nickname, '') <> ''
     ORDER BY m.binance_created_at DESC NULLS LAST, m.updated_at DESC
     LIMIT 1
  ) cn ON true
  ON CONFLICT (order_number) DO UPDATE SET
    exchange_account_id    = EXCLUDED.exchange_account_id,
    last_message_at        = EXCLUDED.last_message_at,
    last_self_message_at   = EXCLUDED.last_self_message_at,
    last_message_text      = EXCLUDED.last_message_text,
    last_message_type      = EXCLUDED.last_message_type,
    last_message_from_self = EXCLUDED.last_message_from_self,
    counterparty_nickname  = EXCLUDED.counterparty_nickname,
    updated_at             = now();
$$;

CREATE OR REPLACE FUNCTION public.trg_refresh_chat_thread_summary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.refresh_terminal_chat_thread_summary(NEW.order_number);
  IF TG_OP = 'UPDATE' AND OLD.order_number IS DISTINCT FROM NEW.order_number THEN
    PERFORM public.refresh_terminal_chat_thread_summary(OLD.order_number);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_thread_summary ON public.binance_order_chat_messages;
CREATE TRIGGER trg_chat_thread_summary
AFTER INSERT OR UPDATE ON public.binance_order_chat_messages
FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_chat_thread_summary();

-- Initial backfill
INSERT INTO public.terminal_chat_thread_summary (
  order_number, exchange_account_id, last_message_at, last_self_message_at,
  last_message_text, last_message_type, last_message_from_self, counterparty_nickname, updated_at
)
SELECT b.order_number, b.exchange_account_id, b.last_message_at, b.last_self_message_at,
       lm.message_text, lm.message_type, lm.sender_is_self, cn.sender_nickname, now()
FROM (
  SELECT m.order_number,
         max(m.exchange_account_id::text)::uuid AS exchange_account_id,
         max(m.binance_created_at) FILTER (
           WHERE coalesce(m.is_system_message,false)=false
             AND coalesce(m.message_type,'') NOT IN ('system','card')) AS last_message_at,
         max(m.binance_created_at) FILTER (
           WHERE m.sender_is_self IS TRUE
             AND coalesce(m.is_system_message,false)=false
             AND coalesce(m.message_type,'') NOT IN ('system','card')) AS last_self_message_at
  FROM public.binance_order_chat_messages m
  GROUP BY m.order_number
) b
LEFT JOIN LATERAL (
  SELECT m.message_text, m.message_type, m.sender_is_self
    FROM public.binance_order_chat_messages m
   WHERE m.order_number = b.order_number
     AND coalesce(m.is_system_message,false)=false
     AND coalesce(m.message_type,'') NOT IN ('system','card')
   ORDER BY m.binance_created_at DESC NULLS LAST, m.updated_at DESC
   LIMIT 1
) lm ON true
LEFT JOIN LATERAL (
  SELECT m.sender_nickname
    FROM public.binance_order_chat_messages m
   WHERE m.order_number = b.order_number
     AND m.sender_is_self IS NOT TRUE
     AND coalesce(m.sender_nickname,'') <> ''
   ORDER BY m.binance_created_at DESC NULLS LAST, m.updated_at DESC
   LIMIT 1
) cn ON true
ON CONFLICT (order_number) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_terminal_chat_inbox(
  p_exchange_account_id uuid DEFAULT NULL::uuid,
  p_limit integer DEFAULT 300,
  p_search text DEFAULT NULL::text
)
RETURNS TABLE(order_number text, exchange_account_id uuid, counterparty_nickname text, verified_name text, trade_type text, asset text, fiat_unit text, amount text, total_price text, order_status text, create_time bigint, last_message_at timestamptz, last_message_preview text, last_message_from_self boolean, unread_count integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH allowed AS (
    SELECT (auth.role() = 'service_role' OR public.can_view_orders(auth.uid())) AS ok
  ),
  base AS (
    SELECT s.*
    FROM public.terminal_chat_thread_summary s, allowed a
    WHERE a.ok
      AND s.last_message_at IS NOT NULL
      AND (p_exchange_account_id IS NULL OR s.exchange_account_id = p_exchange_account_id)
  ),
  enriched AS (
    SELECT b.*,
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
           coalesce(nullif(h.trade_type, ''), c.raw->>'tradeType', '') AS resolved_trade_type
    FROM base b
    LEFT JOIN public.binance_order_history h ON h.order_number = b.order_number
    LEFT JOIN public.terminal_active_orders_cache c
           ON c.order_number = b.order_number
          AND c.exchange_account_id IS NOT DISTINCT FROM b.exchange_account_id
  ),
  filtered AS (
    SELECT e.*
    FROM enriched e
    WHERE (p_search IS NULL OR p_search = ''
      OR e.order_number ILIKE '%' || p_search || '%'
      OR coalesce(e.counter_part_nick_name, '') ILIKE '%' || p_search || '%'
      OR coalesce(e.counterparty_nickname, '') ILIKE '%' || p_search || '%'
      OR coalesce(e.history_verified_name, '') ILIKE '%' || p_search || '%'
      OR coalesce(e.raw->>'buyerNickname', '') ILIKE '%' || p_search || '%'
      OR coalesce(e.raw->>'sellerNickname', '') ILIKE '%' || p_search || '%')
    ORDER BY e.last_message_at DESC NULLS LAST
    LIMIT greatest(coalesce(p_limit, 300), 1)
  )
  SELECT
    f.order_number,
    f.exchange_account_id,
    coalesce(
      nullif(f.counter_part_nick_name, ''),
      nullif(f.counterparty_nickname, ''),
      nullif(CASE upper(f.resolved_trade_type)
        WHEN 'SELL' THEN coalesce(f.raw->>'buyerNickname', f.raw->>'counterPartNickName')
        WHEN 'BUY' THEN coalesce(f.raw->>'sellerNickname', f.raw->>'counterPartNickName')
        ELSE coalesce(f.raw->>'counterPartNickName', f.raw->>'buyerNickname', f.raw->>'sellerNickname')
      END, ''),
      ''
    ) AS counterparty_nickname,
    coalesce(f.history_verified_name, '') AS verified_name,
    f.resolved_trade_type AS trade_type,
    coalesce(nullif(f.history_asset, ''), f.raw->>'asset', 'USDT') AS asset,
    coalesce(nullif(f.history_fiat_unit, ''), f.raw->>'fiat', 'INR') AS fiat_unit,
    coalesce(f.history_amount::text, f.raw->>'amount', '0') AS amount,
    coalesce(f.history_total_price::text, f.raw->>'totalPrice', '0') AS total_price,
    coalesce(
      CASE f.raw->>'orderStatus'
        WHEN '1' THEN 'TRADING'
        WHEN '2' THEN 'BUYER_PAYED'
        WHEN '3' THEN 'BUYER_PAYED'
        WHEN '4' THEN 'COMPLETED'
        WHEN '5' THEN 'APPEAL'
        WHEN '6' THEN 'CANCELLED'
        WHEN '7' THEN 'CANCELLED_BY_SYSTEM'
        ELSE NULL
      END,
      nullif(f.history_order_status, ''),
      ''
    ) AS order_status,
    coalesce(f.history_create_time, (f.raw->>'createTime')::bigint, (extract(epoch FROM f.last_message_at) * 1000)::bigint) AS create_time,
    f.last_message_at,
    CASE WHEN f.last_message_type = 'image' THEN '[Image]' ELSE left(coalesce(f.last_message_text, ''), 140) END AS last_message_preview,
    coalesce(f.last_message_from_self, false) AS last_message_from_self,
    u.unread_count
  FROM filtered f
  LEFT JOIN public.terminal_binance_chat_reads r ON r.order_number = f.order_number
  CROSS JOIN LATERAL (
    SELECT count(*)::int AS unread_count
    FROM public.binance_order_chat_messages m
    WHERE m.order_number = f.order_number
      AND m.sender_is_self IS NOT TRUE
      AND coalesce(m.is_system_message, false) = false
      AND coalesce(m.message_type, '') NOT IN ('system','card')
      AND m.binance_created_at > greatest(
            coalesce(r.last_read_at, to_timestamp(0)),
            coalesce(f.last_self_message_at, to_timestamp(0)))
  ) u
  ORDER BY f.last_message_at DESC NULLS LAST
$function$;