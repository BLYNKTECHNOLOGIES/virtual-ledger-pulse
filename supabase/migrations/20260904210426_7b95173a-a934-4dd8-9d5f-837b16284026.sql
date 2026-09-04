DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.hr_attendance_day_range(
    (SELECT array_agg(id) FROM public.hr_employees WHERE is_active LIMIT 1),
    '2026-08-01'::date, '2026-08-31'::date);
  RAISE NOTICE 'hr_attendance_day_range self-check rows=%', n;
END $$;