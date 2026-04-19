DROP TRIGGER IF EXISTS trg_failed_spot_trade_erp_task ON public.spot_trade_history;
DROP FUNCTION IF EXISTS public.trigger_erp_task_on_failed_spot_trade();

DELETE FROM public.erp_tasks
WHERE 'spot-trade' = ANY(tags) AND 'auto-generated' = ANY(tags);