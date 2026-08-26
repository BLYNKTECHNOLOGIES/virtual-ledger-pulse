DROP FUNCTION IF EXISTS public.get_counterparty_completed_order_count(text, text, uuid);

GRANT EXECUTE ON FUNCTION public.get_counterparty_completed_order_count(text, text, uuid, text) TO authenticated, service_role;