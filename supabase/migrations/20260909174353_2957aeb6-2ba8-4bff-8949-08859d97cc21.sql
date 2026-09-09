-- 1) Drop exact duplicates already stored under the real order.
DELETE FROM public.binance_order_chat_messages m
 WHERE m.order_number LIKE 'INQ-%'
   AND m.raw_payload->>'topicId' ~ '^[0-9]{18,22}$'
   AND EXISTS (
     SELECT 1 FROM public.binance_order_chat_messages x
      WHERE x.order_number = m.raw_payload->>'topicId'
        AND x.dedupe_key = m.dedupe_key);

-- 2) Any remaining topic-bearing orphans move onto their order.
UPDATE public.binance_order_chat_messages m
   SET order_number = m.raw_payload->>'topicId'
 WHERE m.order_number LIKE 'INQ-%'
   AND m.raw_payload->>'topicId' ~ '^[0-9]{18,22}$';

-- 3) Frames with no topicId: attach by unmasked counterparty nickname to that
--    counterparty's newest order on the same account at/near the message time.
--    Every Binance chat belongs to an order (open, completed or cancelled);
--    there is no order-less enquiry channel.
CREATE OR REPLACE FUNCTION public.match_chat_order_by_nickname(
  p_nickname text, p_account uuid, p_at timestamptz)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT h.order_number
    FROM public.binance_order_history h
   WHERE p_nickname IS NOT NULL
     AND p_nickname <> ''
     AND position('*' in p_nickname) = 0
     AND h.counter_part_nick_name = p_nickname
     AND h.exchange_account_id IS NOT DISTINCT FROM p_account
     AND h.create_time <= (extract(epoch from p_at) * 1000) + 600000
   ORDER BY h.create_time DESC
   LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.match_chat_order_by_nickname(text, uuid, timestamptz) FROM anon;

UPDATE public.binance_order_chat_messages m
   SET order_number = t.resolved
  FROM (
    SELECT c.id,
           public.match_chat_order_by_nickname(c.sender_nickname, c.exchange_account_id, c.binance_created_at) AS resolved
      FROM public.binance_order_chat_messages c
     WHERE c.order_number LIKE 'INQ-%'
       AND c.sender_is_self IS NOT TRUE
  ) t
 WHERE m.id = t.id
   AND t.resolved IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.binance_order_chat_messages x
      WHERE x.order_number = t.resolved AND x.dedupe_key = m.dedupe_key);

-- 4) Same nickname fallback for future inserts.
CREATE OR REPLACE FUNCTION public.resolve_chat_thread_order_number()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
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
      NEW.raw_payload->>'nickName');
  END IF;

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
      RETURN NEW;
    END IF;
  END IF;

  resolved := public.match_chat_order_by_nickname(
    NEW.sender_nickname, NEW.exchange_account_id,
    COALESCE(NEW.binance_created_at, now()));
  IF resolved IS NOT NULL THEN
    NEW.order_number := resolved;
  END IF;

  RETURN NEW;
END;
$$;