-- lovable-cron-fallback-reviewed: existing schedules re-registered unchanged (AM-SEC-6 header-only change; uptime is per-minute by design)
CREATE OR REPLACE FUNCTION public.internal_cron_headers()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('Content-Type','application/json',
    'x-scheduler-secret', (SELECT secret_value FROM public.app_scheduler_secrets WHERE name = 'internal_cron'));
$$;
REVOKE ALL ON FUNCTION public.internal_cron_headers() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.internal_cron_headers() TO service_role;

SELECT cron.schedule('terminal-ad-uptime-collector-every-minute', '* * * * *', $c$
  SELECT net.http_post(
    url := 'https://vagiqbespusdxsbqpvbo.supabase.co/functions/v1/terminal-ad-uptime-collector',
    headers := public.internal_cron_headers(),
    body := '{}'::jsonb
  ) AS request_id;
$c$);
SELECT cron.schedule('capture-order-nicknames-30min', '*/30 * * * *', $c$
  SELECT net.http_post(
    url := 'https://vagiqbespusdxsbqpvbo.supabase.co/functions/v1/capture-order-nicknames',
    headers := public.internal_cron_headers(),
    body := '{"windowMinutes": 90}'::jsonb
  ) AS request_id;
$c$);
SELECT cron.schedule('terminal-chat-sweep-every-minute', '* * * * *', $c$
  SELECT net.http_post(
    url := 'https://vagiqbespusdxsbqpvbo.supabase.co/functions/v1/terminal-chat-sweep',
    headers := public.internal_cron_headers(),
    body := '{}'::jsonb
  ) AS request_id;
$c$);

CREATE OR REPLACE FUNCTION public.notify_terminal_chat_sweep()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  new_count int;
  old_count int;
BEGIN
  new_count := COALESCE(NULLIF(NEW.raw->>'chatUnreadCount', '')::int, 0);
  old_count := CASE WHEN TG_OP = 'UPDATE' THEN COALESCE(NULLIF(OLD.raw->>'chatUnreadCount', '')::int, 0) ELSE 0 END;
  IF new_count > 0 AND new_count IS DISTINCT FROM old_count THEN
    PERFORM net.http_post(
      url := 'https://vagiqbespusdxsbqpvbo.supabase.co/functions/v1/terminal-chat-sweep',
      headers := public.internal_cron_headers(),
      body := jsonb_build_object('orderNo', NEW.order_number, 'exchangeAccountId', NEW.exchange_account_id)
    );
  END IF;
  RETURN NEW;
END;
$function$;