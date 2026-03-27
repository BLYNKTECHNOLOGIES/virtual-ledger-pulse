
CREATE TABLE public.email_notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL,
  recipient_user_id uuid NOT NULL,
  recipient_email text,
  event_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.date_trunc_day_immutable(ts timestamptz)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$ SELECT ts::date $$;

CREATE UNIQUE INDEX idx_email_notif_dedup 
  ON public.email_notification_log (task_id, recipient_user_id, event_type, public.date_trunc_day_immutable(created_at));

CREATE INDEX idx_email_notif_task ON public.email_notification_log (task_id);
CREATE INDEX idx_email_notif_created ON public.email_notification_log (created_at);

ALTER TABLE public.email_notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON public.email_notification_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);
