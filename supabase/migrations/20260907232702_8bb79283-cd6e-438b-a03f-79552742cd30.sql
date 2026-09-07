ALTER TABLE public.binance_order_chat_messages
  ADD COLUMN IF NOT EXISTS capture_source text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS capture_latency_ms integer;

CREATE OR REPLACE FUNCTION public.set_chat_capture_latency()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  latency_ms bigint;
BEGIN
  IF NEW.binance_create_time IS NOT NULL AND NEW.captured_at IS NOT NULL THEN
    latency_ms := (EXTRACT(EPOCH FROM NEW.captured_at) * 1000)::bigint - NEW.binance_create_time;
    NEW.capture_latency_ms := LEAST(GREATEST(latency_ms, 0), 2147483647)::integer;
  ELSE
    NEW.capture_latency_ms := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_binance_chat_capture_latency
  BEFORE INSERT OR UPDATE ON public.binance_order_chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.set_chat_capture_latency();

CREATE INDEX IF NOT EXISTS idx_binance_chat_capture_source_latency
  ON public.binance_order_chat_messages (capture_source, capture_latency_ms)
  WHERE capture_latency_ms IS NOT NULL;

GRANT SELECT, INSERT, UPDATE ON public.binance_order_chat_messages TO authenticated;
GRANT ALL ON public.binance_order_chat_messages TO service_role;

ALTER PUBLICATION supabase_realtime ADD TABLE public.terminal_notifications;