REVOKE ALL ON FUNCTION public.fn_allocate_compoff_credit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hr_sync_compoff_allocation_trigger() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hr_guard_compoff_allocation_amount() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hr_grant_sunday_work_credit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hr_compoff_close_month(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_compoff_close_month(date) TO authenticated, service_role;