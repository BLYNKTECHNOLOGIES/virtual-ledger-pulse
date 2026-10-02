DO $$
DECLARE v text; v2 text;
BEGIN
  v := pg_get_functiondef('public.hr_resolve_stale_session'::regproc);
  v2 := replace(v, $a$  v_wdate := public.hr_v4_window_date_of(v_session.in_time);
$a$, $a$  v_wdate := public.hr_v4_window_date_of(v_session.in_time);

  -- A locked period is frozen: refuse the change and keep the watchdog entry open
  -- so HR can unlock the period and resolve it properly.
  IF public.hr_v4_is_window_locked(v_wdate) THEN
    RAISE EXCEPTION 'Could not update: attendance for % is locked (Period Lock). Remove the period lock, then resolve this entry again.', to_char(v_wdate, 'DD Mon YYYY')
      USING ERRCODE = 'P0001';
  END IF;
$a$);
  IF v2 = v THEN RAISE EXCEPTION 'resolve patch failed'; END IF;
  EXECUTE v2;

  v := pg_get_functiondef('public.hr_watchdog_open_sessions'::regproc);
  v2 := replace(v, $a$     WHERE ss.status = 'open'
  ),
  session_fix AS ($a$, $a$     WHERE ss.status = 'open'
       AND NOT public.hr_v4_is_window_locked(ss.attendance_date)
  ),
  session_fix AS ($a$);
  v2 := replace(v2, $a$     WHERE ss.status = 'open'
       AND NOT EXISTS (
         SELECT 1 FROM public.hr_attendance_sessions s$a$, $a$     WHERE ss.status = 'open'
       AND NOT public.hr_v4_is_window_locked(ss.attendance_date)
       AND NOT EXISTS (
         SELECT 1 FROM public.hr_attendance_sessions s$a$);
  IF v2 = v OR position('NOT public.hr_v4_is_window_locked(ss.attendance_date)' in v2) = 0 THEN RAISE EXCEPTION 'watchdog patch failed'; END IF;
  EXECUTE v2;
END $$;