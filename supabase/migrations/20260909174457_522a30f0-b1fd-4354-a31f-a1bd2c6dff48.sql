CREATE OR REPLACE FUNCTION public.reattach_inquiry_chats_to_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.binance_order_chat_messages m
     SET order_number = NEW.order_number
   WHERE m.order_number LIKE 'INQ-%'
     AND (
       m.raw_payload->>'topicId' = NEW.order_number
       OR (
         NEW.counter_part_nick_name IS NOT NULL
         AND position('*' in NEW.counter_part_nick_name) = 0
         AND m.sender_nickname = NEW.counter_part_nick_name
         AND m.exchange_account_id IS NOT DISTINCT FROM NEW.exchange_account_id
       )
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.binance_order_chat_messages x
        WHERE x.order_number = NEW.order_number AND x.dedupe_key = m.dedupe_key);
  RETURN NEW;
END;
$$;