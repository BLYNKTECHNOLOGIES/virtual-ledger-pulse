ALTER TABLE public.binance_order_chat_messages
ADD COLUMN IF NOT EXISTS dedupe_key text;

UPDATE public.binance_order_chat_messages
SET dedupe_key = COALESCE(
  NULLIF(binance_message_id, ''),
  NULLIF(binance_uuid, ''),
  md5(COALESCE(raw_payload::text, '') || '|' || COALESCE(order_number, '') || '|' || COALESCE(binance_create_time::text, '') || '|' || COALESCE(message_type, 'unknown'))
)
WHERE dedupe_key IS NULL;

ALTER TABLE public.binance_order_chat_messages
ALTER COLUMN dedupe_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_binance_order_chat_messages_dedupe
ON public.binance_order_chat_messages (order_number, dedupe_key);

CREATE OR REPLACE FUNCTION public.has_terminal_permission(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.p2p_terminal_user_roles ur
    JOIN public.p2p_terminal_role_permissions rp ON rp.role_id = ur.role_id
    WHERE ur.user_id = _user_id
      AND rp.permission::text = _permission
  );
$$;

DROP POLICY IF EXISTS "authenticated_read_binance_order_chat_messages" ON public.binance_order_chat_messages;
CREATE POLICY "terminal_authorized_read_binance_order_chat_messages"
ON public.binance_order_chat_messages
FOR SELECT
TO authenticated
USING (
  public.has_terminal_permission(auth.uid(), 'terminal_orders_view')
  OR public.has_terminal_permission(auth.uid(), 'terminal_orders_chat')
  OR public.has_terminal_permission(auth.uid(), 'terminal_audit_logs_view')
  OR public.has_terminal_permission(auth.uid(), 'terminal_orders_manage')
);
