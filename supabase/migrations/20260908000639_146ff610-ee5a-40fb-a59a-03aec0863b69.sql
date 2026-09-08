CREATE TABLE public.terminal_chat_pins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  order_number text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, order_number)
);

GRANT SELECT, INSERT, DELETE ON public.terminal_chat_pins TO authenticated;
GRANT ALL ON public.terminal_chat_pins TO service_role;

ALTER TABLE public.terminal_chat_pins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own pinned chats"
ON public.terminal_chat_pins
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());