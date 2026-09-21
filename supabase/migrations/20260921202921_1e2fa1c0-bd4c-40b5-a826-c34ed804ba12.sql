CREATE OR REPLACE FUNCTION public.notify_auto_reply_on_order_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_secret text;
  v_status text;
  v_old_status text;
BEGIN
  v_status := upper(COALESCE(NEW.order_status::text, ''));
  v_old_status := CASE WHEN TG_OP = 'UPDATE' THEN upper(COALESCE(OLD.order_status::text, '')) ELSE '' END;

  IF upper(COALESCE(NEW.trade_type::text, '')) <> 'SELL'
     OR v_status NOT IN ('4', 'COMPLETED')
     OR (TG_OP = 'UPDATE' AND v_old_status IN ('4', 'COMPLETED'))
     OR NEW.order_number IS NULL
     OR NEW.order_number !~ '^[0-9]{10,}$' THEN
    RETURN NEW;
  END IF;

  SELECT secret_value INTO v_secret
  FROM public.app_scheduler_secrets
  WHERE name = 'internal_cron';

  IF v_secret IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://vagiqbespusdxsbqpvbo.supabase.co/functions/v1/auto-reply-engine',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-scheduler-secret', v_secret,
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInJlZiI6InZhZ2lxYmVzcHVzZHhzYnFwdmJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAwMzM2OTcsImV4cCI6MjA2NTYwOTY5N30.LTH1iLnl11H4KZ_qWekz-x7PGhD7UAgpw8EEifGKnrM'
    ),
    body := jsonb_build_object(
      'orderNumber', NEW.order_number,
      'triggerEvent', 'order_released'
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_auto_reply_on_order_completed() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_auto_reply_on_order_completed() TO service_role;

DROP TRIGGER IF EXISTS trg_auto_reply_on_order_completed ON public.binance_order_history;
CREATE TRIGGER trg_auto_reply_on_order_completed
AFTER INSERT OR UPDATE OF order_status ON public.binance_order_history
FOR EACH ROW
EXECUTE FUNCTION public.notify_auto_reply_on_order_completed();