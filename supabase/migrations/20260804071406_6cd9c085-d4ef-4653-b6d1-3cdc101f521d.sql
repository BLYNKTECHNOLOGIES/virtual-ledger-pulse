DO $do$
DECLARE eid uuid;
BEGIN
  SELECT id INTO eid FROM public.hr_employees WHERE first_name = 'Subham' AND last_name = 'Patle' LIMIT 1;
  IF eid IS NOT NULL THEN
    PERFORM public.hr_v4_recompute_range(eid, '2026-08-01'::date, '2026-08-04'::date);
    RAISE NOTICE 'recompute ok';
  END IF;
END $do$;