DO $m$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.hr_attendance_day_range(uuid[],date,date)'::regprocedure);
  IF position('LEFT JOIN public.hr_attendance_day_v v ON v.employee_id = b.employee_id AND v.date = b.date' in d) = 0 THEN
    RAISE EXCEPTION 'expected join not found';
  END IF;
  d := replace(d, 'LEFT JOIN public.hr_attendance_day_v v ON v.employee_id = b.employee_id AND v.date = b.date',
    'LEFT JOIN LATERAL (SELECT v0.* FROM public.hr_attendance_day_v v0 WHERE v0.employee_id = b.employee_id AND v0.date = b.date LIMIT 1) v ON true');
  EXECUTE d;
END $m$;