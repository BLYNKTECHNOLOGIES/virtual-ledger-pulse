CREATE OR REPLACE FUNCTION public.notify_auto_reply_on_release()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_secret text;
  v_order text;
BEGIN
  IF NEW.message_text IS NULL OR NEW.message_text NOT LIKE '%seller_completed%' THEN
    RETURN NEW;
  END IF;

  v_order := NEW.order_number;
  IF v_order IS NULL OR v_order !~ '^[0-9]{10,}$' THEN
    RETURN NEW;
  END IF;

  SELECT secret_value INTO v_secret FROM public.app_scheduler_secrets WHERE name = 'internal_cron';
  IF v_secret IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://vagiqbespusdxsbqpvbo.supabase.co/functions/v1/auto-reply-engine',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-scheduler-secret', v_secret,
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhZ2lxYmVzcHVzZHhzYnFwdmJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAwMzM2OTcsImV4cCI6MjA2NTYwOTY5N30.LTH1iLnl11H4KZ_qWekz-x7PGhD7UAgpw8EEifGKnrM'
    ),
    body := jsonb_build_object('orderNumber', v_order, 'triggerEvent', 'order_released')
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_reply_on_release ON public.binance_order_chat_messages;
CREATE TRIGGER trg_auto_reply_on_release
AFTER INSERT ON public.binance_order_chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.notify_auto_reply_on_release();