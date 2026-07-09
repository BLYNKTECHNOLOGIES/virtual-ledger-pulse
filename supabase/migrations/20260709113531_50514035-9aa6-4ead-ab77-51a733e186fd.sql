-- Configurable business-report email formats
CREATE TABLE public.report_email_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  variant text NOT NULL DEFAULT 'profit' CHECK (variant IN ('profit','operations')),
  recipients text[] NOT NULL DEFAULT '{}',
  send_time text NOT NULL DEFAULT '11:00',
  enabled boolean NOT NULL DEFAULT true,
  is_monthly boolean NOT NULL DEFAULT false,
  last_sent_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_email_configs TO authenticated;
GRANT ALL ON public.report_email_configs TO service_role;

ALTER TABLE public.report_email_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage report configs"
  ON public.report_email_configs
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super admin'));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_report_email_configs_updated_at
  BEFORE UPDATE ON public.report_email_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed the two built-in formats
INSERT INTO public.report_email_configs (name, variant, recipients, send_time, enabled)
VALUES
  ('Profit Business Report', 'profit', ARRAY['Shubham.singh@blynkex.com','abhisheksingh@blynkex.com'], '11:00', true),
  ('Operations Business Report', 'operations', ARRAY[]::text[], '11:00', false);

-- Replace the fixed 11 AM daily cron with a per-config dispatcher (every 5 minutes)
SELECT cron.unschedule('daily-report-email-11am-ist');

SELECT cron.schedule(
  'dispatch-report-emails-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://vagiqbespusdxsbqpvbo.supabase.co/functions/v1/dispatch-report-emails',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhZ2lxYmVzcHVzZHhzYnFwdmJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAwMzM2OTcsImV4cCI6MjA2NTYwOTY5N30.LTH1iLnl11H4KZ_qWekz-x7PGhD7UAgpw8EEifGKnrM"}'::jsonb,
    body := '{"scheduled": true}'::jsonb
  ) AS request_id;
  $$
);