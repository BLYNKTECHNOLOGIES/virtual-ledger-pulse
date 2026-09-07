CREATE TABLE IF NOT EXISTS public.terminal_binance_chat_reads (
  order_number text PRIMARY KEY,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  read_by_user_id uuid,
  read_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.terminal_binance_chat_reads TO authenticated;
GRANT ALL ON public.terminal_binance_chat_reads TO service_role;

ALTER TABLE public.terminal_binance_chat_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view chat reads" ON public.terminal_binance_chat_reads;
CREATE POLICY "Authenticated can view chat reads"
  ON public.terminal_binance_chat_reads FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can insert chat reads" ON public.terminal_binance_chat_reads;
CREATE POLICY "Authenticated can insert chat reads"
  ON public.terminal_binance_chat_reads FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated can update chat reads" ON public.terminal_binance_chat_reads;
CREATE POLICY "Authenticated can update chat reads"
  ON public.terminal_binance_chat_reads FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.mark_terminal_binance_chat_read(p_order_number text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_order_number IS NULL OR p_order_number = '' THEN RETURN; END IF;
  INSERT INTO public.terminal_binance_chat_reads (order_number, last_read_at, read_by_user_id)
  VALUES (p_order_number, now(), auth.uid())
  ON CONFLICT (order_number) DO UPDATE
    SET last_read_at = now(),
        read_by_user_id = auth.uid(),
        updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_terminal_binance_chat_read(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_terminal_chat_inbox(
  p_exchange_account_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 300,
  p_search text DEFAULT NULL
)
RETURNS TABLE (
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
  last_message_at timestamptz,
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
      max(m.binance_created_at) AS last_message_at,
      count(*) FILTER (
        WHERE m.sender_is_self IS NOT TRUE
          AND coalesce(m.is_system_message, false) = false
          AND coalesce(m.message_type, '') NOT IN ('system', 'card')
          AND m.binance_created_at > coalesce(r.last_read_at, to_timestamp(0))
      )::int AS unread_count
    FROM public.binance_order_chat_messages m
    LEFT JOIN public.terminal_binance_chat_reads r ON r.order_number = m.order_number
    WHERE (p_exchange_account_id IS NULL OR m.exchange_account_id = p_exchange_account_id)
    GROUP BY m.order_number, r.last_read_at
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
  )
  SELECT
    a.order_number,
    coalesce(a.exchange_account_id, h.exchange_account_id) AS exchange_account_id,
    coalesce(h.counter_part_nick_name, '') AS counterparty_nickname,
    coalesce(h.verified_name, '') AS verified_name,
    coalesce(h.trade_type, '') AS trade_type,
    coalesce(h.asset, 'USDT') AS asset,
    coalesce(h.fiat_unit, 'INR') AS fiat_unit,
    coalesce(h.amount::text, '0') AS amount,
    coalesce(h.total_price::text, '0') AS total_price,
    coalesce(h.order_status, '') AS order_status,
    coalesce(h.create_time, (extract(epoch FROM a.last_message_at) * 1000)::bigint) AS create_time,
    a.last_message_at,
    CASE
      WHEN lm.message_type = 'image' THEN '[image]'
      ELSE left(coalesce(lm.message_text, ''), 140)
    END AS last_message_preview,
    coalesce(lm.sender_is_self, false) AS last_message_from_self,
    a.unread_count
  FROM agg a
  LEFT JOIN public.binance_order_history h ON h.order_number = a.order_number
  LEFT JOIN last_msg lm ON lm.order_number = a.order_number
  WHERE p_search IS NULL OR p_search = ''
     OR a.order_number ILIKE '%' || p_search || '%'
     OR coalesce(h.counter_part_nick_name, '') ILIKE '%' || p_search || '%'
     OR coalesce(h.verified_name, '') ILIKE '%' || p_search || '%'
  ORDER BY (a.unread_count > 0) DESC, a.last_message_at DESC NULLS LAST
  LIMIT greatest(coalesce(p_limit, 300), 1);
$$;

GRANT EXECUTE ON FUNCTION public.get_terminal_chat_inbox(uuid, integer, text) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_bocm_order_created
  ON public.binance_order_chat_messages (order_number, binance_created_at DESC);