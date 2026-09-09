DELETE FROM public.binance_order_chat_messages m
WHERE m.order_number LIKE 'INQ-%'
  AND EXISTS (
    SELECT 1 FROM public.binance_order_chat_messages x
    WHERE x.order_number NOT LIKE 'INQ-%'
      AND x.dedupe_key = m.dedupe_key
      AND x.exchange_account_id IS NOT DISTINCT FROM m.exchange_account_id
  );