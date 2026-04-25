CREATE TABLE IF NOT EXISTS public.binance_order_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL,
  binance_message_id text,
  binance_uuid text,
  message_type text NOT NULL DEFAULT 'unknown',
  chat_message_type text,
  sender_is_self boolean,
  sender_nickname text,
  message_status text,
  binance_create_time bigint,
  binance_created_at timestamptz,
  message_text text,
  image_url text,
  thumbnail_url text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_system_message boolean NOT NULL DEFAULT false,
  is_recall boolean NOT NULL DEFAULT false,
  is_compliance_relevant boolean NOT NULL DEFAULT false,
  captured_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT binance_order_chat_messages_identity_present CHECK (binance_message_id IS NOT NULL OR binance_uuid IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_binance_order_chat_messages_msg_id
  ON public.binance_order_chat_messages (order_number, binance_message_id)
  WHERE binance_message_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_binance_order_chat_messages_uuid
  ON public.binance_order_chat_messages (order_number, binance_uuid)
  WHERE binance_uuid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_binance_order_chat_messages_order_time
  ON public.binance_order_chat_messages (order_number, binance_create_time);

CREATE INDEX IF NOT EXISTS idx_binance_order_chat_messages_type
  ON public.binance_order_chat_messages (message_type);

CREATE INDEX IF NOT EXISTS idx_binance_order_chat_messages_compliance
  ON public.binance_order_chat_messages (is_compliance_relevant, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_binance_order_chat_messages_raw
  ON public.binance_order_chat_messages USING gin (raw_payload);

ALTER TABLE public.binance_order_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_binance_order_chat_messages" ON public.binance_order_chat_messages;
CREATE POLICY "authenticated_read_binance_order_chat_messages"
ON public.binance_order_chat_messages
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "service_all_binance_order_chat_messages" ON public.binance_order_chat_messages;
CREATE POLICY "service_all_binance_order_chat_messages"
ON public.binance_order_chat_messages
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP TRIGGER IF EXISTS update_binance_order_chat_messages_updated_at ON public.binance_order_chat_messages;
CREATE TRIGGER update_binance_order_chat_messages_updated_at
BEFORE UPDATE ON public.binance_order_chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();