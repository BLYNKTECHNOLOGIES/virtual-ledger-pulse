CREATE OR REPLACE FUNCTION public.notify_auto_reply_payment_marked()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  secret text;
BEGIN
  IF NEW.is_system_message IS NOT TRUE AND COALESCE(NEW.message_type, '') <> 'system' THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.message_text, '') NOT LIKE '%"type":"seller_payed"%' THEN
    RETURN NEW;
  END IF;
  IF NEW.order_number IS NULL OR NEW.order_number LIKE 'INQ-%' THEN
    RETURN NEW;
  END IF;

  SELECT secret_value INTO secret FROM public.app_scheduler_secrets WHERE name = 'internal_cron';
  IF secret IS NULL THEN RETURN NEW; END IF;

  PERFORM net.http_post(
    url := 'https://vagiqbespusdxsbqpvbo.supabase.co/functions/v1/auto-reply-engine',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-scheduler-secret', secret),
    body := jsonb_build_object('orderNumber', NEW.order_number, 'triggerEvent', 'payment_marked')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_auto_reply_payment_marked ON public.binance_order_chat_messages;
CREATE TRIGGER trg_notify_auto_reply_payment_marked
AFTER INSERT ON public.binance_order_chat_messages
FOR EACH ROW EXECUTE FUNCTION public.notify_auto_reply_payment_marked();