-- Internal chat messages table
CREATE TABLE public.terminal_internal_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL,
  sender_id uuid NOT NULL,
  sender_name text NOT NULL,
  message_text text,
  file_url text,
  file_name text,
  message_type text NOT NULL DEFAULT 'text',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_internal_messages_order ON public.terminal_internal_messages(order_number, created_at);

ALTER TABLE public.terminal_internal_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to internal messages" ON public.terminal_internal_messages
  FOR ALL USING (true) WITH CHECK (true);

-- Internal chat read tracking table
CREATE TABLE public.terminal_internal_chat_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL,
  user_id uuid NOT NULL,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_number, user_id)
);

ALTER TABLE public.terminal_internal_chat_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to internal chat reads" ON public.terminal_internal_chat_reads
  FOR ALL USING (true) WITH CHECK (true);

-- Storage bucket for internal chat files
INSERT INTO storage.buckets (id, name, public) VALUES ('internal-chat-files', 'internal-chat-files', true);

CREATE POLICY "Allow public uploads to internal-chat-files" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'internal-chat-files');

CREATE POLICY "Allow public reads from internal-chat-files" ON storage.objects
  FOR SELECT USING (bucket_id = 'internal-chat-files');

CREATE POLICY "Allow public deletes from internal-chat-files" ON storage.objects
  FOR DELETE USING (bucket_id = 'internal-chat-files');

-- Enable realtime for internal messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.terminal_internal_messages;