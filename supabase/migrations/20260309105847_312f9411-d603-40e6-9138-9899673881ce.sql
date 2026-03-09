
-- Terminal user presence tracking (heartbeat-based)
CREATE TABLE public.terminal_user_presence (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_online BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.terminal_user_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read presence"
  ON public.terminal_user_presence FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Users can upsert own presence"
  ON public.terminal_user_presence FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Users can update own presence"
  ON public.terminal_user_presence FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- Terminal notifications table
CREATE TABLE public.terminal_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  notification_type TEXT NOT NULL DEFAULT 'inactive_assignee',
  related_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.terminal_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notifications"
  ON public.terminal_notifications FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated can insert notifications"
  ON public.terminal_notifications FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Users can update own notifications"
  ON public.terminal_notifications FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Users can delete own notifications"
  ON public.terminal_notifications FOR DELETE
  TO authenticated USING (true);

-- Index for fast lookups
CREATE INDEX idx_terminal_notifications_user_id ON public.terminal_notifications(user_id, is_read, is_active);
CREATE INDEX idx_terminal_presence_online ON public.terminal_user_presence(is_online);
