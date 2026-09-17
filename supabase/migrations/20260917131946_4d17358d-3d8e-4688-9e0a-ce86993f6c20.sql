REVOKE SELECT ON TABLE public.cp_order_identity FROM authenticated;

CREATE OR REPLACE FUNCTION public.get_cp_order_identity_for_terminal(p_order_number text)
RETURNS TABLE(cp_userno text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.cp_userno
  FROM public.cp_order_identity i
  WHERE i.order_number = p_order_number
    AND (
      public.has_terminal_permission(auth.uid(), 'terminal_orders_view')
      OR public.has_terminal_permission(auth.uid(), 'terminal_orders_chat')
      OR public.has_terminal_permission(auth.uid(), 'terminal_orders_manage')
      OR public.has_terminal_permission(auth.uid(), 'terminal_audit_logs_view')
    )
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.get_cp_order_identity_for_terminal(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cp_order_identity_for_terminal(text) TO authenticated, service_role;