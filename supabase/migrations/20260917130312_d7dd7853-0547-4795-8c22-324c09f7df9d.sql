REVOKE ALL ON FUNCTION public.get_counterparty_order_history(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_counterparty_order_history(text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_counterparty_order_history(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_counterparty_order_history(text, uuid) TO service_role;