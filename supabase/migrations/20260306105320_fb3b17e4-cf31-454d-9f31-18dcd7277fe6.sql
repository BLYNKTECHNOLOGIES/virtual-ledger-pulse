
-- Fix stale pending settlement for SO-TRM-98152192
-- The order was edited from INDUS BLYNK POS (gateway) to ICICI BLYNK UPI (non-gateway)
-- but the old pending settlement was never cleaned up.
-- The bank transaction is already correct on ICICI BLYNK.

DELETE FROM public.pending_settlements 
WHERE sales_order_id = 'c783b52f-1fd0-41ec-9776-11bc7c5d05e2';
