CREATE OR REPLACE FUNCTION public.resolve_chat_thread_order_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  grp text;
  topic text;
  resolved text;
  candidate_count integer;
BEGIN
  -- Never rewrite a message that is already attached to a real order.
  IF NEW.order_number IS NOT NULL AND NEW.order_number NOT LIKE 'INQ-%' THEN
    RETURN NEW;
  END IF;

  IF NEW.sender_nickname IS NULL THEN
    NEW.sender_nickname := COALESCE(
      NEW.raw_payload->>'fromNickname',
      NEW.raw_payload->>'fromNickName',
      NEW.raw_payload->>'senderNickName',
      NEW.raw_payload->>'nickName'
    );
  END IF;

  -- Binance topicId is the authoritative order-scoped chat topic.
  topic := NEW.raw_payload->>'topicId';
  IF topic ~ '^[0-9]{10,}$'
     AND EXISTS (
       SELECT 1
       FROM public.binance_order_history h
       WHERE h.order_number = topic
         AND (NEW.exchange_account_id IS NULL OR h.exchange_account_id = NEW.exchange_account_id)
     ) THEN
    NEW.order_number := topic;
    RETURN NEW;
  END IF;

  -- A group may be used only when it maps to exactly one real order on the
  -- same account. Ambiguous groups remain isolated; nickname is never used.
  grp := COALESCE(NEW.raw_payload->>'groupId', substring(COALESCE(NEW.order_number, '') from 5));
  IF grp IS NOT NULL AND grp <> '' THEN
    SELECT count(DISTINCT m.order_number), min(m.order_number)
      INTO candidate_count, resolved
    FROM public.binance_order_chat_messages m
    WHERE m.raw_payload->>'groupId' = grp
      AND m.order_number NOT LIKE 'INQ-%'
      AND m.exchange_account_id IS NOT DISTINCT FROM NEW.exchange_account_id;

    IF candidate_count = 1 THEN
      NEW.order_number := resolved;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_resolve_chat_thread_order_number ON public.binance_order_chat_messages;
CREATE TRIGGER trg_resolve_chat_thread_order_number
BEFORE INSERT OR UPDATE ON public.binance_order_chat_messages
FOR EACH ROW EXECUTE FUNCTION public.resolve_chat_thread_order_number();