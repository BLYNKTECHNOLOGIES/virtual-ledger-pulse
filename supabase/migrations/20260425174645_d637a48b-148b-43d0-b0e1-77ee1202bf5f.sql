ALTER TABLE public.binance_order_chat_messages
DROP CONSTRAINT IF EXISTS binance_order_chat_messages_identity_present;

ALTER TABLE public.binance_order_chat_messages
ADD COLUMN IF NOT EXISTS content_type text;

CREATE INDEX IF NOT EXISTS idx_binance_order_chat_messages_content_type
ON public.binance_order_chat_messages (content_type);
