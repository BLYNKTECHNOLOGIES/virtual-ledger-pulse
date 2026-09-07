-- Trigger-driven chat sweep: fires when an order's unread chat count increases.
CREATE OR REPLACE FUNCTION public.notify_terminal_chat_sweep()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count int;
  old_count int;
BEGIN
  new_count := COALESCE(NULLIF(NEW.raw->>'chatUnreadCount', '')::int, 0);
  old_count := CASE WHEN TG_OP = 'UPDATE' THEN COALESCE(NULLIF(OLD.raw->>'chatUnreadCount', '')::int, 0) ELSE 0 END;
  IF new_count > 0 AND new_count IS DISTINCT FROM old_count THEN
    PERFORM net.http_post(
      url := 'https://vagiqbespusdxsbqpvbo.supabase.co/functions/v1/terminal-chat-sweep',
      headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhZ2lxYmVzcHVzZHhzYnFwdmJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAwMzM2OTcsImV4cCI6MjA2NTYwOTY5N30.LTH1iLnl11H4KZ_qWekz-x7PGhD7UAgpw8EEifGKnrM"}'::jsonb,
      body := jsonb_build_object('orderNo', NEW.order_number, 'exchangeAccountId', NEW.exchange_account_id)
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_terminal_chat_sweep() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_terminal_chat_sweep_notify ON public.terminal_active_orders_cache;
CREATE TRIGGER trg_terminal_chat_sweep_notify
  AFTER INSERT OR UPDATE OF raw ON public.terminal_active_orders_cache
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_terminal_chat_sweep();

SELECT cron.schedule(
  'terminal-chat-sweep-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://vagiqbespusdxsbqpvbo.supabase.co/functions/v1/terminal-chat-sweep',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhZ2lxYmVzcHVzZHhzYnFwdmJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAwMzM2OTcsImV4cCI6MjA2NTYwOTY5N30.LTH1iLnl11H4KZ_qWekz-x7PGhD7UAgpw8EEifGKnrM"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Keep name enrichment hourly but raise batch limit to 100
SELECT cron.unschedule('enrich-order-names-hourly');
SELECT cron.schedule(
  'enrich-order-names-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://vagiqbespusdxsbqpvbo.supabase.co/functions/v1/enrich-order-names',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhZ2lxYmVzcHVzZHhzYnFwdmJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAwMzM2OTcsImV4cCI6MjA2NTYwOTY5N30.LTH1iLnl11H4KZ_qWekz-x7PGhD7UAgpw8EEifGKnrM"}'::jsonb,
    body := '{"limit":100}'::jsonb
  ) AS request_id;
  $$
);