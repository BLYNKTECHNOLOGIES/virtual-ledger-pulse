select cron.unschedule(jobid) from cron.job where jobname = 'hr-auto-deactivate-separated';

select cron.schedule(
  'hr-auto-deactivate-separated',
  '30 19 * * *',
  $j$SELECT net.http_post(
    url:='https://vagiqbespusdxsbqpvbo.supabase.co/functions/v1/hr-auto-deactivate-separated',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhZ2lxYmVzcHVzZHhzYnFwdmJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAwMzM2OTcsImV4cCI6MjA2NTYwOTY5N30.LTH1iLnl11H4KZ_qWekz-x7PGhD7UAgpw8EEifGKnrM"}'::jsonb,
    body:='{"scheduled": true}'::jsonb,
    timeout_milliseconds:=120000
  ) AS request_id;$j$
);