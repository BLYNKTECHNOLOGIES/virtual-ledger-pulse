DO $$
DECLARE
  v_secret text;
BEGIN
  SELECT secret_value INTO v_secret FROM public.app_scheduler_secrets WHERE name = 'internal_cron';

  PERFORM cron.unschedule(jobname)
  FROM cron.job
  WHERE jobname IN (
    'hr-drift-scan-every-30min',
    'hr-drift-scan-nightly',
    'hr-essl-sync-devices-48h',
    'hr-razorpay-snapshot-refresh-nightly'
  );

  PERFORM cron.schedule('hr-drift-scan-every-30min', '*/30 * * * *', format($f$
    SELECT net.http_post(
      url := 'https://vagiqbespusdxsbqpvbo.supabase.co/functions/v1/hr-drift-scan',
      headers := %L::jsonb,
      body := '{}'::jsonb
    );
  $f$, jsonb_build_object('Content-Type','application/json','x-scheduler-secret', v_secret)));

  PERFORM cron.schedule('hr-drift-scan-nightly', '30 20 * * *', format($f$
    SELECT net.http_post(
      url := 'https://vagiqbespusdxsbqpvbo.supabase.co/functions/v1/hr-drift-scan',
      headers := %L::jsonb,
      body := '{}'::jsonb
    );
  $f$, jsonb_build_object('Content-Type','application/json','x-scheduler-secret', v_secret)));

  PERFORM cron.schedule('hr-essl-sync-devices-48h', '0 3 */2 * *', format($f$
    SELECT net.http_post(
      url := 'https://vagiqbespusdxsbqpvbo.supabase.co/functions/v1/hr-essl-sync-devices',
      headers := %L::jsonb,
      body := '{}'::jsonb
    );
  $f$, jsonb_build_object('Content-Type','application/json','x-scheduler-secret', v_secret)));

  PERFORM cron.schedule('hr-razorpay-snapshot-refresh-nightly', '0 20 * * *', format($f$
    SELECT net.http_post(
      url := 'https://vagiqbespusdxsbqpvbo.supabase.co/functions/v1/hr-razorpay-snapshot-refresh?lookback_days=30&limit=200',
      headers := %L::jsonb,
      body := '{}'::jsonb
    );
  $f$, jsonb_build_object('Content-Type','application/json','x-scheduler-secret', v_secret)));
END $$;