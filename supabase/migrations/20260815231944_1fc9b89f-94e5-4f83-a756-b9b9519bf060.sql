DO $do$
DECLARE e record;
BEGIN
  FOR e IN SELECT id FROM public.hr_employees WHERE is_active = true LOOP
    PERFORM public.hr_v4_recompute_range(e.id, '2026-08-01'::date, '2026-08-15'::date);
  END LOOP;
END $do$;