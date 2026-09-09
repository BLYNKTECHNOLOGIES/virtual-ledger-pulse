ALTER TABLE public.p2p_auto_reply_rules DROP CONSTRAINT IF EXISTS p2p_auto_reply_rules_trigger_event_check;
ALTER TABLE public.p2p_auto_reply_rules ADD CONSTRAINT p2p_auto_reply_rules_trigger_event_check
  CHECK (trigger_event = ANY (ARRAY['order_received','payment_marked','payment_pending','order_cancelled','order_appealed','timer_breach','order_completed','order_released'])) NOT VALID;
ALTER TABLE public.p2p_auto_reply_rules DROP CONSTRAINT IF EXISTS p2p_auto_reply_rules_trade_type_check;
ALTER TABLE public.p2p_auto_reply_rules ADD CONSTRAINT p2p_auto_reply_rules_trade_type_check
  CHECK (trade_type IS NULL OR trade_type = ANY (ARRAY['BUY','SELL','SMALL_BUY','SMALL_SELL'])) NOT VALID;