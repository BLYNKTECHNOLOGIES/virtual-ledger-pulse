-- 1. Backfill nickname from Binance's own payload (fromNickname / fromNickName)
UPDATE public.binance_order_chat_messages
SET sender_nickname = COALESCE(raw_payload->>'fromNickname', raw_payload->>'fromNickName', raw_payload->>'senderNickName', raw_payload->>'nickName')
WHERE sender_nickname IS NULL
  AND COALESCE(raw_payload->>'fromNickname', raw_payload->>'fromNickName', raw_payload->>'senderNickName', raw_payload->>'nickName') IS NOT NULL;

-- 2. Stronger resolver: Binance chat always belongs to an order, so an INQ-*
--    thread means we simply have not identified it yet.
CREATE OR REPLACE FUNCTION public.resolve_chat_thread_order_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  grp text;
  topic text;
  nick text;
  msg_time bigint;
  resolved text;
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number NOT LIKE 'INQ-%' THEN
    RETURN NEW;
  END IF;

  IF NEW.sender_nickname IS NULL THEN
    NEW.sender_nickname := COALESCE(NEW.raw_payload->>'fromNickname', NEW.raw_payload->>'fromNickName',
                                    NEW.raw_payload->>'senderNickName', NEW.raw_payload->>'nickName');
  END IF;

  -- (a) Binance's own order id on the frame
  topic := NEW.raw_payload->>'topicId';
  IF topic ~ '^[0-9]{6,}$' THEN
    NEW.order_number := topic;
    RETURN NEW;
  END IF;

  -- (b) another message from the same chat group that is already identified
  grp := COALESCE(NEW.raw_payload->>'groupId', substring(NEW.order_number from 5));
  IF grp IS NOT NULL AND grp <> '' THEN
    SELECT m.order_number INTO resolved
    FROM public.binance_order_chat_messages m
    WHERE m.raw_payload->>'groupId' = grp
      AND m.order_number NOT LIKE 'INQ-%'
      AND (NEW.exchange_account_id IS NULL OR m.exchange_account_id = NEW.exchange_account_id)
    ORDER BY m.binance_created_at DESC NULLS LAST
    LIMIT 1;
    IF resolved IS NOT NULL THEN
      NEW.order_number := resolved;
      RETURN NEW;
    END IF;
  END IF;

  -- (c) the counterparty's nickname matched to their nearest order on this
  --     account (a counterparty can only chat with us through an order)
  nick := NULLIF(NEW.sender_nickname, '');
  IF nick IS NOT NULL AND NEW.sender_is_self IS NOT TRUE THEN
    msg_time := COALESCE(NEW.binance_create_time, (EXTRACT(EPOCH FROM COALESCE(NEW.binance_created_at, now())) * 1000)::bigint);
    SELECT o.order_number INTO resolved
    FROM public.binance_order_history o
    WHERE o.counter_part_nick_name = nick
      AND (NEW.exchange_account_id IS NULL OR o.exchange_account_id IS NULL OR o.exchange_account_id = NEW.exchange_account_id)
      AND o.create_time <= msg_time + 86400000
    ORDER BY o.create_time DESC
    LIMIT 1;
    IF resolved IS NULL THEN
      SELECT o.order_number INTO resolved
      FROM public.binance_order_history o
      WHERE o.counter_part_nick_name = nick
        AND (NEW.exchange_account_id IS NULL OR o.exchange_account_id IS NULL OR o.exchange_account_id = NEW.exchange_account_id)
      ORDER BY o.create_time DESC
      LIMIT 1;
    END IF;
    IF resolved IS NOT NULL THEN
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

-- 3. One-time repair of existing orphan rows, same precedence.
UPDATE public.binance_order_chat_messages m
SET order_number = m.raw_payload->>'topicId'
WHERE m.order_number LIKE 'INQ-%'
  AND m.raw_payload->>'topicId' ~ '^[0-9]{6,}$'
  AND NOT EXISTS (
    SELECT 1 FROM public.binance_order_chat_messages x
    WHERE x.order_number = m.raw_payload->>'topicId'
      AND x.dedupe_key = m.dedupe_key
      AND x.exchange_account_id IS NOT DISTINCT FROM m.exchange_account_id
  );

WITH grp_map AS (
  SELECT raw_payload->>'groupId' AS grp,
         exchange_account_id,
         (ARRAY_AGG(order_number ORDER BY binance_created_at DESC NULLS LAST))[1] AS real_order
  FROM public.binance_order_chat_messages
  WHERE order_number NOT LIKE 'INQ-%' AND raw_payload->>'groupId' IS NOT NULL
  GROUP BY 1,2
)
UPDATE public.binance_order_chat_messages m
SET order_number = g.real_order
FROM grp_map g
WHERE m.order_number LIKE 'INQ-%'
  AND COALESCE(m.raw_payload->>'groupId', substring(m.order_number from 5)) = g.grp
  AND m.exchange_account_id IS NOT DISTINCT FROM g.exchange_account_id
  AND NOT EXISTS (
    SELECT 1 FROM public.binance_order_chat_messages x
    WHERE x.order_number = g.real_order
      AND x.dedupe_key = m.dedupe_key
      AND x.exchange_account_id IS NOT DISTINCT FROM m.exchange_account_id
  );

WITH nick_match AS (
  SELECT m.id,
         (SELECT o.order_number
            FROM public.binance_order_history o
           WHERE o.counter_part_nick_name = m.sender_nickname
             AND (m.exchange_account_id IS NULL OR o.exchange_account_id IS NULL OR o.exchange_account_id = m.exchange_account_id)
             AND o.create_time <= COALESCE(m.binance_create_time, (EXTRACT(EPOCH FROM m.binance_created_at) * 1000)::bigint) + 86400000
           ORDER BY o.create_time DESC
           LIMIT 1) AS real_order
  FROM public.binance_order_chat_messages m
  WHERE m.order_number LIKE 'INQ-%'
    AND m.sender_nickname IS NOT NULL
    AND m.sender_is_self IS NOT TRUE
)
UPDATE public.binance_order_chat_messages m
SET order_number = n.real_order
FROM nick_match n
WHERE m.id = n.id
  AND n.real_order IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.binance_order_chat_messages x
    WHERE x.order_number = n.real_order
      AND x.dedupe_key = m.dedupe_key
      AND x.exchange_account_id IS NOT DISTINCT FROM m.exchange_account_id
  );