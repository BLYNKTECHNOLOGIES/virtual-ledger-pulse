-- lovable-cron-fallback-reviewed: 1440 runs/day; Binance exposes no dependable unread webhook or flag, so a one-minute rotating reconciliation is required as a backstop to the persistent listener.
ALTER TABLE public.binance_order_chat_messages REPLICA IDENTITY FULL;

SELECT cron.unschedule('terminal-chat-sweep-hourly');
SELECT cron.schedule(
  'terminal-chat-sweep-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://vagiqbespusdxsbqpvbo.supabase.co/functions/v1/terminal-chat-sweep',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYXNlIiwicmVmIjoidmFnaXFiZXNwdXNkeHNicXB2Ym8iLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc1MDAzMzY5NywiZXhwIjoyMDY1NjA5Njk3fQ.LTH1iLnl11H4KZ_qWekz-x7PGhD7UAgpw8EEifGKnrM"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);