REVOKE EXECUTE ON FUNCTION public.hr_reconcile_capacity_hiring(boolean) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.hr_reconcile_capacity_hiring(boolean) FROM anon;
DO $$
BEGIN
  PERFORM public.hr_reconcile_capacity_hiring(true);
END;
$$;