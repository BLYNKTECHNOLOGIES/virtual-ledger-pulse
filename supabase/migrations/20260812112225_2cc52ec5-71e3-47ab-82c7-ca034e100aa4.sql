DO $$
DECLARE v_emp uuid;
BEGIN
  SELECT employee_id INTO v_emp FROM public.hr_attendance_sessions
   WHERE out_time IS NULL AND attendance_date = '2026-08-11' LIMIT 1;
  IF v_emp IS NOT NULL THEN
    PERFORM public.hr_v4_recompute_range(v_emp, '2026-08-11'::date, '2026-08-11'::date);
  END IF;
END $$;