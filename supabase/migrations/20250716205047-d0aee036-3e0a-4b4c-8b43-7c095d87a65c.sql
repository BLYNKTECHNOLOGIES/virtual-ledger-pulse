-- Enable pg_cron extension for scheduled jobs
SELECT cron.schedule(
  'reset-payment-limits-hourly',
  '0 * * * *', -- Every hour at minute 0
  $$
  SELECT
    net.http_post(
        url:='https://vagiqbespusdxsbqpvbo.supabase.co/functions/v1/reset-payment-limits',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhZ2lxYmVzcHVzZHhzYnFwdmJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAwMzM2OTcsImV4cCI6MjA2NTYwOTY5N30.LTH1iLnl11H4KZ_qWekz-x7PGhD7UAgpw8EEifGKnrM"}'::jsonb,
        body:=concat('{"timestamp": "', now(), '"}')::jsonb
    ) as request_id;
  $$
);