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

  -- Binance topicId IS the order-scoped chat topic and equals the order number.
  -- Accept it on shape alone: the order row often syncs into
  -- binance_order_history AFTER the first chat frame arrives, and requiring the
  -- history row stranded those threads as synthetic "INQ-*" enquiries forever.
  topic := NEW.raw_payload->>'topicId';
  IF topic ~ '^[0-9]{18,22}$' THEN
    NEW.order_number := topic;
    RETURN NEW;
  END IF;

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

-- Late-arriving orders: when an order lands in history, re-attach any synthetic
-- enquiry threads that belong to it (by topicId, or by an unambiguous groupId).
CREATE OR REPLACE FUNCTION public.reattach_inquiry_chats_to_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.binance_order_chat_messages m
     SET order_number = NEW.order_number
   WHERE m.order_number LIKE 'INQ-%'
     AND m.raw_payload->>'topicId' = NEW.order_number
     AND NOT EXISTS (
       SELECT 1 FROM public.binance_order_chat_messages x
        WHERE x.order_number = NEW.order_number
          AND x.dedupe_key = m.dedupe_key
     );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reattach_inquiry_chats ON public.binance_order_history;
CREATE TRIGGER trg_reattach_inquiry_chats
AFTER INSERT ON public.binance_order_history
FOR EACH ROW EXECUTE FUNCTION public.reattach_inquiry_chats_to_order();

-- Backfill existing stranded enquiry threads.
UPDATE public.binance_order_chat_messages m
   SET order_number = m.raw_payload->>'topicId'
 WHERE m.order_number LIKE 'INQ-%'
   AND m.raw_payload->>'topicId' ~ '^[0-9]{18,22}$'
   AND NOT EXISTS (
     SELECT 1 FROM public.binance_order_chat_messages x
      WHERE x.order_number = m.raw_payload->>'topicId'
        AND x.dedupe_key = m.dedupe_key
   );