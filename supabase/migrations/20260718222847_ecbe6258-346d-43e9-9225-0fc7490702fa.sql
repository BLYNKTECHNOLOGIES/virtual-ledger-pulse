CREATE TABLE IF NOT EXISTS public.app_scheduler_secrets (
  name text PRIMARY KEY,
  secret_value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.app_scheduler_secrets TO service_role;

ALTER TABLE public.app_scheduler_secrets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'app_scheduler_secrets'
      AND policyname = 'service role manages scheduler secrets'
  ) THEN
    CREATE POLICY "service role manages scheduler secrets"
      ON public.app_scheduler_secrets
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.touch_app_scheduler_secrets_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_app_scheduler_secrets_updated_at ON public.app_scheduler_secrets;
CREATE TRIGGER touch_app_scheduler_secrets_updated_at
  BEFORE UPDATE ON public.app_scheduler_secrets
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_app_scheduler_secrets_updated_at();

INSERT INTO public.app_scheduler_secrets (name, secret_value)
VALUES (
  'razorpay_payslip_auto_sync',
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
)
ON CONFLICT (name) DO NOTHING;

ALTER TYPE public.hr_razorpay_sync_action ADD VALUE IF NOT EXISTS 'reflect_payslips';
ALTER TYPE public.hr_razorpay_sync_action ADD VALUE IF NOT EXISTS 'import_payslip_history_range';

UPDATE public.hr_razorpay_settings
   SET pull_payslips_endpoint_verified = true,
       pull_payslips_envelope_key = 'payroll:view-payroll',
       pull_payslips_envelope_verified_at = COALESCE(pull_payslips_envelope_verified_at, now())
 WHERE is_singleton = true;

DO $$
BEGIN
  PERFORM cron.unschedule('razorpay-auto-sync-payslips-daily');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'razorpay-auto-sync-payslips-daily',
  '45 21 * * *',
  $$
  SELECT net.http_post(
    url := 'https://vagiqbespusdxsbqpvbo.supabase.co/functions/v1/razorpay-payroll-proxy',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhZ2lxYmVzcHVzZHhzYnFwdmJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAwMzM2OTcsImV4cCI6MjA2NTYwOTY5N30.LTH1iLnl11H4KZ_qWekz-x7PGhD7UAgpw8EEifGKnrM',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhZ2lxYmVzcHVzZHhzYnFwdmJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAwMzM2OTcsImV4cCI6MjA2NTYwOTY5N30.LTH1iLnl11H4KZ_qWekz-x7PGhD7UAgpw8EEifGKnrM',
      'x-razorpay-sync-secret', (
        SELECT secret_value
          FROM public.app_scheduler_secrets
         WHERE name = 'razorpay_payslip_auto_sync'
      )
    ),
    body := jsonb_build_object(
      'action', 'import_payslip_history_range',
      'scheduled', true,
      'period_from', to_char((now() AT TIME ZONE 'Asia/Kolkata')::date - interval '24 months', 'YYYY-MM'),
      'period_to', to_char((now() AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM'),
      'pull_from_razorpay', true
    )
  ) AS request_id;
  $$
);