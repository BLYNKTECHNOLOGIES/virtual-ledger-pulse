DO $$
BEGIN
  PERFORM cron.unschedule('razorpay-auto-sync-payslips-restore-once');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'razorpay-auto-sync-payslips-restore-once',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://vagiqbespusdxsbqpvbo.supabase.co/functions/v1/razorpay-payroll-proxy',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhZ2lxYmVzcHVzZHhzYnFwdmJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAwMzM2OTcsImV4cCI6MjA2NTYwOTY5N30.LTH1iLnl11H4KZ_qWekz-x7PGhD7UAgpw8EEifGKnrM',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInJlZiI6InZhZ2lxYmVzcHVzZHhzYnFwdmJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAwMzM2OTcsImV4cCI6MjA2NTYwOTY5N30.LTH1iLnl11H4KZ_qWekz-x7PGhD7UAgpw8EEifGKnrM',
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
  SELECT cron.unschedule('razorpay-auto-sync-payslips-restore-once');
  $$
);