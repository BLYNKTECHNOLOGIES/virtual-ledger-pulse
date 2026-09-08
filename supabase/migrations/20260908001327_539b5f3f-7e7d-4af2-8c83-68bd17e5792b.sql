CREATE INDEX IF NOT EXISTS idx_chat_msgs_group_id ON public.binance_order_chat_messages ((raw_payload->>'groupId'));

CREATE OR REPLACE FUNCTION public.resolve_chat_thread_order_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  grp text;
  topic text;
  resolved text;
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number NOT LIKE 'INQ-%' THEN
    RETURN NEW;
  END IF;

  topic := NEW.raw_payload->>'topicId';
  IF topic ~ '^[0-9]{6,}$' THEN
    NEW.order_number := topic;
    RETURN NEW;
  END IF;

  grp := COALESCE(NEW.raw_payload->>'groupId', substring(NEW.order_number from 5));
  IF grp IS NULL OR grp = '' THEN
    RETURN NEW;
  END IF;

  SELECT m.order_number INTO resolved
  FROM public.binance_order_chat_messages m
  WHERE m.raw_payload->>'groupId' = grp
    AND m.order_number NOT LIKE 'INQ-%'
    AND (NEW.exchange_account_id IS NULL OR m.exchange_account_id = NEW.exchange_account_id)
  ORDER BY m.binance_created_at DESC NULLS LAST
  LIMIT 1;

  IF resolved IS NOT NULL THEN
    NEW.order_number := resolved;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_resolve_chat_thread_order_number ON public.binance_order_chat_messages;
CREATE TRIGGER trg_resolve_chat_thread_order_number
BEFORE INSERT ON public.binance_order_chat_messages
FOR EACH ROW EXECUTE FUNCTION public.resolve_chat_thread_order_number();

-- Repair existing split rows
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