
CREATE OR REPLACE FUNCTION public.trg_learn_nickname_from_chat()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nick text := NULLIF(btrim(COALESCE(NEW.sender_nickname, '')), '');
BEGIN
  IF NEW.sender_is_self IS TRUE OR v_nick IS NULL OR v_nick LIKE '%*%'
     OR lower(v_nick) IN ('blynkex', 'asec-corporation', 'unknown') THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.order_nickname_registry
    (order_number, exchange_account_id, nickname, captured_at, expires_at)
  VALUES (NEW.order_number, NEW.exchange_account_id, v_nick, now(), NULL)
  ON CONFLICT (order_number) DO UPDATE
    SET nickname = EXCLUDED.nickname,
        exchange_account_id = COALESCE(EXCLUDED.exchange_account_id, public.order_nickname_registry.exchange_account_id),
        expires_at = NULL
    WHERE public.order_nickname_registry.nickname IS NULL
       OR public.order_nickname_registry.nickname LIKE '%*%';

  UPDATE public.binance_order_history
  SET counter_part_nick_name = v_nick
  WHERE order_number = NEW.order_number
    AND (counter_part_nick_name IS NULL OR counter_part_nick_name LIKE '%*%' OR btrim(counter_part_nick_name) = '');

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS learn_nickname_from_chat ON public.binance_order_chat_messages;
CREATE TRIGGER learn_nickname_from_chat
AFTER INSERT ON public.binance_order_chat_messages
FOR EACH ROW EXECUTE FUNCTION public.trg_learn_nickname_from_chat();

-- Backfill from chat history already recorded
WITH cp AS (
  SELECT DISTINCT ON (order_number) order_number, exchange_account_id, btrim(sender_nickname) AS nick
  FROM public.binance_order_chat_messages
  WHERE sender_is_self IS NOT TRUE
    AND sender_nickname IS NOT NULL
    AND btrim(sender_nickname) <> ''
    AND sender_nickname NOT LIKE '%*%'
    AND lower(btrim(sender_nickname)) NOT IN ('blynkex','asec-corporation','unknown')
  ORDER BY order_number, binance_create_time DESC NULLS LAST
)
INSERT INTO public.order_nickname_registry (order_number, exchange_account_id, nickname, captured_at, expires_at)
SELECT order_number, exchange_account_id, nick, now(), NULL FROM cp
ON CONFLICT (order_number) DO NOTHING;

UPDATE public.binance_order_history h
SET counter_part_nick_name = r.nickname
FROM public.order_nickname_registry r
WHERE r.order_number = h.order_number
  AND r.nickname IS NOT NULL AND r.nickname NOT LIKE '%*%'
  AND (h.counter_part_nick_name IS NULL OR h.counter_part_nick_name LIKE '%*%' OR btrim(h.counter_part_nick_name) = '');
