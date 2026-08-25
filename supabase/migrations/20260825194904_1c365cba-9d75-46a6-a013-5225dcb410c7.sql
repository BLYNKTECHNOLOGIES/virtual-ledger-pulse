REVOKE EXECUTE ON FUNCTION public.can_view_banking(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_banking(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_clients(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_view_orders(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_orders(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hr_can_access_payroll_data(uuid) FROM PUBLIC, anon;