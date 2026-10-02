DO $$
DECLARE v text; v2 text;
BEGIN
  v := pg_get_functiondef('public.hr_attendance_month_summary(uuid[],date)'::regprocedure);
  v2 := replace(v, $a$      AND NOT public.hr_stale_session_held(d.employee_id, d.attendance_date)$a$,
$a$      AND NOT public.hr_stale_session_held(d.employee_id, d.attendance_date)
      -- A missing punch-out already settled in the watchdog (auto-paired or HR-resolved)
      -- has been reviewed; only a voided session still needs HR's attention.
      AND NOT EXISTS (SELECT 1 FROM public.hr_attendance_stale_sessions ss
                      WHERE ss.employee_id = d.employee_id AND ss.attendance_date = d.attendance_date
                        AND ss.status <> 'open' AND ss.status <> 'resolved_voided')$a$);
  IF v2 = v THEN RAISE EXCEPTION 'patch did not apply'; END IF;
  EXECUTE v2;
END $$;