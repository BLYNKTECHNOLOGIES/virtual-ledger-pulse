
-- 1) Replace the existing daily job with a two-step (discover -> import) 36-month sweep.
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
  WITH discover AS (
    SELECT net.http_post(
      url := 'https://vagiqbespusdxsbqpvbo.supabase.co/functions/v1/razorpay-payroll-proxy',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer scheduler',
        'x-razorpay-sync-secret', (
          SELECT secret_value FROM public.app_scheduler_secrets
           WHERE name = 'razorpay_payslip_auto_sync'
        )
      ),
      body := jsonb_build_object(
        'action', 'discover_and_seed_runs',
        'scheduled', true,
        'payload', jsonb_build_object(
          'period_from', to_char((now() AT TIME ZONE 'Asia/Kolkata')::date - interval '36 months', 'YYYY-MM'),
          'period_to',   to_char((now() AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM')
        )
      )
    ) AS request_id
  )
  SELECT net.http_post(
    url := 'https://vagiqbespusdxsbqpvbo.supabase.co/functions/v1/razorpay-payroll-proxy',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer scheduler',
      'x-razorpay-sync-secret', (
        SELECT secret_value FROM public.app_scheduler_secrets
         WHERE name = 'razorpay_payslip_auto_sync'
      )
    ),
    body := jsonb_build_object(
      'action', 'import_payslip_history_range',
      'scheduled', true,
      'payload', jsonb_build_object(
        'period_from', to_char((now() AT TIME ZONE 'Asia/Kolkata')::date - interval '36 months', 'YYYY-MM'),
        'period_to',   to_char((now() AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM'),
        'pull_from_razorpay', true
      )
    )
  ) AS request_id FROM discover;
  $$
);

-- 2) One-shot job: fire the same discover-then-import within 2 minutes, then self-unschedule.
DO $$
BEGIN
  PERFORM cron.unschedule('razorpay-payslip-history-oneshot');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'razorpay-payslip-history-oneshot',
  '* * * * *',
  $$
  WITH discover AS (
    SELECT net.http_post(
      url := 'https://vagiqbespusdxsbqpvbo.supabase.co/functions/v1/razorpay-payroll-proxy',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer scheduler',
        'x-razorpay-sync-secret', (
          SELECT secret_value FROM public.app_scheduler_secrets
           WHERE name = 'razorpay_payslip_auto_sync'
        )
      ),
      body := jsonb_build_object(
        'action', 'discover_and_seed_runs',
        'scheduled', true,
        'payload', jsonb_build_object(
          'period_from', to_char((now() AT TIME ZONE 'Asia/Kolkata')::date - interval '36 months', 'YYYY-MM'),
          'period_to',   to_char((now() AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM')
        )
      )
    ) AS request_id
  ),
  import AS (
    SELECT net.http_post(
      url := 'https://vagiqbespusdxsbqpvbo.supabase.co/functions/v1/razorpay-payroll-proxy',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer scheduler',
        'x-razorpay-sync-secret', (
          SELECT secret_value FROM public.app_scheduler_secrets
           WHERE name = 'razorpay_payslip_auto_sync'
        )
      ),
      body := jsonb_build_object(
        'action', 'import_payslip_history_range',
        'scheduled', true,
        'payload', jsonb_build_object(
          'period_from', to_char((now() AT TIME ZONE 'Asia/Kolkata')::date - interval '36 months', 'YYYY-MM'),
          'period_to',   to_char((now() AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM'),
          'pull_from_razorpay', true
        )
      )
    ) AS request_id FROM discover
  )
  SELECT cron.unschedule('razorpay-payslip-history-oneshot') FROM import;
  $$
);
