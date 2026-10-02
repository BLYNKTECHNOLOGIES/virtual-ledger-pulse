DO $$
DECLARE v text; v2 text;
BEGIN
  -- 1) LOP count: a day with an HR-approved attendance correction counts as a full attended day
  v := pg_get_functiondef('public.hr_lop_days_window(uuid[],date,date,date)'::regprocedure);
  v2 := replace(v, $a$SUM(CASE WHEN r.st = 'half_day' THEN 0.5$a$,
                   $a$SUM(CASE WHEN r.regularized AND r.st <> 'on_leave' THEN 1
               WHEN r.st = 'half_day' THEN 0.5$a$);
  v2 := replace(v2, $a$SUM(CASE WHEN r.st = 'absent' THEN 1 ELSE 0 END)::numeric AS absent_d$a$,
                    $a$SUM(CASE WHEN r.st = 'absent' AND NOT r.regularized THEN 1 ELSE 0 END)::numeric AS absent_d$a$);
  v2 := replace(v2, $a$SUM(CASE WHEN r.st = 'half_day' THEN 1 ELSE 0 END)::numeric AS half_d$a$,
                    $a$SUM(CASE WHEN r.st = 'half_day' AND NOT r.regularized THEN 1 ELSE 0 END)::numeric AS half_d$a$);
  v2 := replace(v2, $a$    WHERE r.st = 'present'
  ),$a$, $a$    WHERE r.st = 'present' OR (r.regularized AND r.st <> 'on_leave')
  ),$a$);
  IF v2 = v OR (length(v2) - length(v)) < 150 THEN RAISE EXCEPTION 'hr_lop_days_window patch did not apply fully'; END IF;
  EXECUTE v2;

  -- 2) Casual-leave absorption must not spend leave on a day HR already corrected
  v := pg_get_functiondef('public.hr_apply_cl_lop_absorption'::regproc);
  v2 := replace(v, $a$AND LOWER(COALESCE(d.manual_status, d.status, '')) IN ('absent', 'half_day')$a$,
    $a$AND LOWER(COALESCE(d.manual_status, d.status, '')) IN ('absent', 'half_day')
       AND NOT EXISTS (SELECT 1 FROM public.hr_attendance_regularization_requests rg
                       WHERE rg.employee_id = d.employee_id AND rg.attendance_date = d.attendance_date
                         AND LOWER(rg.status) = 'approved')$a$);
  IF v2 = v THEN RAISE EXCEPTION 'hr_apply_cl_lop_absorption patch did not apply'; END IF;
  EXECUTE v2;
END $$;