DO $$
DECLARE v text; v2 text;
BEGIN
  v := pg_get_functiondef('public.hr_lop_days_window(uuid[],date,date,date)'::regprocedure);
  v2 := replace(v, $a$SUM(CASE WHEN r.regularized AND r.st <> 'on_leave' THEN 1
               WHEN r.st = 'half_day' THEN 0.5$a$, $a$SUM(CASE WHEN r.st = 'half_day' THEN 0.5$a$);
  v2 := replace(v2, $a$r.st = 'absent' AND NOT r.regularized THEN 1$a$, $a$r.st = 'absent' THEN 1$a$);
  v2 := replace(v2, $a$r.st = 'half_day' AND NOT r.regularized THEN 1$a$, $a$r.st = 'half_day' THEN 1$a$);
  v2 := replace(v2, $a$WHERE r.st = 'present' OR (r.regularized AND r.st <> 'on_leave')$a$, $a$WHERE r.st = 'present'$a$);
  -- the day's outcome is what the correction set: HR's explicit mark first, else the status recomputed from corrected times
  v2 := replace(v2, $a$LOWER(COALESCE(a.status,'')) AS st$a$, $a$LOWER(COALESCE(a.manual_status, a.status,'')) AS st$a$);
  IF v2 = v OR position('r.regularized AND r.st' in v2) > 0 OR position('a.manual_status, a.status' in v2) = 0 THEN
    RAISE EXCEPTION 'revert did not apply cleanly';
  END IF;
  EXECUTE v2;

  v := pg_get_functiondef('public.hr_apply_cl_lop_absorption'::regproc);
  v2 := replace(v, $a$
       AND NOT EXISTS (SELECT 1 FROM public.hr_attendance_regularization_requests rg
                       WHERE rg.employee_id = d.employee_id AND rg.attendance_date = d.attendance_date
                         AND LOWER(rg.status) = 'approved')$a$, '');
  IF v2 = v THEN RAISE EXCEPTION 'absorption revert did not apply'; END IF;
  EXECUTE v2;
END $$;