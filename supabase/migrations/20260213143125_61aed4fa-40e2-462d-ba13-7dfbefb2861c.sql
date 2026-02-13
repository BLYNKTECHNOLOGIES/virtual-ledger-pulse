
-- Table to persistently track which terminal operator sent each chat message
CREATE TABLE public.chat_message_senders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number TEXT NOT NULL,
  message_content TEXT NOT NULL,
  sent_at_ms BIGINT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookup by order
CREATE INDEX idx_chat_message_senders_order ON public.chat_message_senders (order_number);

-- Composite index for matching: order + content
CREATE INDEX idx_chat_message_senders_match ON public.chat_message_senders (order_number, message_content);

-- Enable RLS
ALTER TABLE public.chat_message_senders ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read/insert (terminal operators)
CREATE POLICY "Authenticated users can read chat senders"
  ON public.chat_message_senders FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert chat senders"
  ON public.chat_message_senders FOR INSERT
  WITH CHECK (true);
