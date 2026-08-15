DO $do$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='hr_v4_recompute_range';

  d := replace(d,
    'public.hr_v4_detect_shift(p_employee_id, t.attendance_date, t.first_in)',
    'public.hr_v4_detect_shift(p_employee_id, t.attendance_date, t.first_in, t.last_out)');
  d := replace(d,
    'public.hr_v4_detect_shift(p_employee_id, d.attendance_date, d.first_in)',
    'public.hr_v4_detect_shift(p_employee_id, d.attendance_date, d.first_in, d.last_out)');

  EXECUTE d;
END $do$;