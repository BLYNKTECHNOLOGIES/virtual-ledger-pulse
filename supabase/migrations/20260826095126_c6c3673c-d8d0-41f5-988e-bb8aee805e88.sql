REVOKE ALL ON FUNCTION public.get_counterparty_completed_order_count(text, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_counterparty_completed_order_count(text, text, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.get_counterparty_completed_order_count(text, text, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_counterparty_completed_order_count(text, text, uuid, text) TO service_role;