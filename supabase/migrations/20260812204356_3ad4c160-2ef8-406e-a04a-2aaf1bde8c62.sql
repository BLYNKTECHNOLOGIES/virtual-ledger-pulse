select cron.unschedule(jobid) from cron.job where jobname = 'hr-auto-deactivate-separated';

select cron.schedule(
  'hr-auto-deactivate-separated',
  '30 19 * * *',
  $$
  select net.http_post(
    url := 'https://vagiqbespusdxsbqpvbo.supabase.co/functions/v1/hr-auto-deactivate-separated',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select value from public.app_scheduler_secrets where key = 'service_role_key' limit 1)
    ),
    body := '{}'::jsonb
  );
  $$
);