SELECT cron.unschedule('compliance-daily-reminders') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'compliance-daily-reminders');
SELECT cron.unschedule('compliance-document-status') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'compliance-document-status');

SELECT cron.schedule(
  'compliance-document-status',
  '20 3 * * *',
  $$SELECT public.compliance_recompute_document_status();$$
);

SELECT cron.schedule(
  'compliance-daily-reminders',
  '30 3 * * *',
  $$SELECT net.http_post(
      url := 'https://vagiqbespusdxsbqpvbo.supabase.co/functions/v1/compliance-reminders',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{"source":"cron"}'::jsonb
  );$$
);