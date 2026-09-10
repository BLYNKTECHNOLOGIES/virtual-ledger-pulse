CREATE OR REPLACE FUNCTION public.terminal_chat_orders_missing_history(
  p_exchange_account_id uuid,
  p_limit integer DEFAULT 10
)
RETURNS TABLE(order_number text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.order_number
  FROM public.terminal_chat_thread_summary s
  WHERE s.exchange_account_id = p_exchange_account_id
    AND s.order_number ~ '^[0-9]+$'
    AND s.last_message_at > now() - interval '60 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.binance_order_history h
      WHERE h.order_number = s.order_number
    )
  ORDER BY s.last_message_at DESC
  LIMIT GREATEST(1, LEAST(coalesce(p_limit, 10), 50));
$$;

REVOKE ALL ON FUNCTION public.terminal_chat_orders_missing_history(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.terminal_chat_orders_missing_history(uuid, integer) TO service_role;