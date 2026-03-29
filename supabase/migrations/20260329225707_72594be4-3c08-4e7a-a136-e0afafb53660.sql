
select cron.schedule(
  'auto-absent-marking-daily',
  '0 2 * * *',
  $$
  select net.http_post(
    url := 'https://vagiqbespusdxsbqpvbo.supabase.co/functions/v1/auto-absent-marking',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhZ2lxYmVzcHVzZHhzYnFwdmJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAwMzM2OTcsImV4cCI6MjA2NTYwOTY5N30.LTH1iLnl11H4KZ_qWekz-x7PGhD7UAgpw8EEifGKnrM"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);
