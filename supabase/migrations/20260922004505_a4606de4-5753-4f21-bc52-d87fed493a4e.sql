DO $$
BEGIN
  PERFORM public.hr_reconcile_capacity_hiring(true);
END;
$$;