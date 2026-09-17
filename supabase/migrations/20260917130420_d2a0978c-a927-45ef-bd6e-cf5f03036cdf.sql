UPDATE public.cp_order_identity i
SET exchange_account_id = h.exchange_account_id
FROM public.binance_order_history h
WHERE h.order_number = i.order_number
  AND h.exchange_account_id IS NOT NULL
  AND i.exchange_account_id IS DISTINCT FROM h.exchange_account_id;

SELECT public.rebuild_cp_order_identity();