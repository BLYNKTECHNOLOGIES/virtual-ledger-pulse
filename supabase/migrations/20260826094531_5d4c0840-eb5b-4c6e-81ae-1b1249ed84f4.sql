REVOKE ALL ON FUNCTION public.get_counterparty_completed_order_count(text, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_counterparty_completed_order_count(text, text, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_counterparty_completed_order_count(text, text, uuid, text) TO authenticated, service_role;