
CREATE OR REPLACE FUNCTION public.hr_v4_recompute_range(
  p_employee_id uuid,
  p_from date,
  p_to date
) RETURNS TABLE(window_date date, net_work_minutes int, session_count int, suppressed_count int)
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  s_debounce int;
  s_cutoff time;
  s_lunch_start time;
  s_lunch_end time;
  s_cutover_date date;
  scan_start timestamptz;
  scan_end timestamptz;
  r RECORD;
  last_kept_ts timestamptz;
  last_kept_type text;
  open_in_id uuid;
  open_in_time timestamptz;
  v_reason text;
  v_minutes int;
  v_wdate date;
  v_next_session_no int;
BEGIN
  SELECT debounce_seconds, day_cutoff_ist, lunch_window_start_ist, lunch_window_end_ist,
         (two_device_cutover_utc AT TIME ZONE 'Asia/Kolkata')::date
    INTO s_debounce, s_cutoff, s_lunch_start, s_lunch_end, s_cutover_date
    FROM public.hr_attendance_engine_settings LIMIT 1;
  IF s_debounce IS NULL THEN
    s_debounce := 15; s_cutoff := '05:00'; s_lunch_start := '12:00'; s_lunch_end := '15:00';
    s_cutover_date := '2026-07-17'::date;
  END IF;

  IF p_to < s_cutover_date THEN
    PERFORM public.hr_rebuild_attendance_daily_range(p_employee_id, p_from, p_to);
    RETURN;
  END IF;
  IF p_from < s_cutover_date THEN
    PERFORM public.hr_rebuild_attendance_daily_range(p_employee_id, p_from, s_cutover_date - 1);
    p_from := s_cutover_date;
  END IF;

  scan_start := ((p_from - 2)::text || ' 00:00:00 Asia/Kolkata')::timestamptz;
  scan_end   := ((p_to   + 1)::text || ' 23:59:59 Asia/Kolkata')::timestamptz;

  UPDATE public.hr_attendance_punches p
     SET effective = true, suppressed_reason = NULL
   WHERE p.employee_id = p_employee_id
     AND p.punch_time >= scan_start AND p.punch_time <= scan_end
     AND public.hr_v4_window_date_of(p.punch_time) BETWEEN p_from AND p_to;

  DELETE FROM public.hr_attendance_sessions
   WHERE employee_id = p_employee_id
     AND attendance_date BETWEEN p_from AND p_to;

  SELECT s.in_punch_id, s.in_time
    INTO open_in_id, open_in_time
    FROM public.hr_attendance_sessions s
   WHERE s.employee_id = p_employee_id
     AND s.out_punch_id IS NULL
     AND s.in_time < scan_start
   ORDER BY s.in_time DESC LIMIT 1;

  last_kept_ts := open_in_time;
  last_kept_type := CASE WHEN open_in_id IS NOT NULL THEN 'in' ELSE NULL END;

  FOR r IN
    SELECT id, punch_time, punch_type
      FROM public.hr_attendance_punches
     WHERE employee_id = p_employee_id
       AND punch_time >= scan_start AND punch_time <= scan_end
       AND punch_type IN ('in','out')
     ORDER BY punch_time ASC, id ASC
  LOOP
    v_reason := NULL;

    IF last_kept_ts IS NOT NULL
       AND EXTRACT(EPOCH FROM (r.punch_time - last_kept_ts)) < s_debounce
    THEN v_reason := 'debounce';
    ELSIF r.punch_type = 'in' THEN
      IF open_in_id IS NOT NULL THEN v_reason := 'redundant_in'; END IF;
    ELSE
      IF open_in_id IS NULL THEN v_reason := 'orphan_out'; END IF;
    END IF;

    IF v_reason IS NOT NULL THEN
      IF public.hr_v4_window_date_of(r.punch_time) BETWEEN p_from AND p_to THEN
        UPDATE public.hr_attendance_punches
           SET effective = false, suppressed_reason = v_reason WHERE id = r.id;
      END IF;
      CONTINUE;
    END IF;

    last_kept_ts := r.punch_time;
    last_kept_type := r.punch_type;

    IF r.punch_type = 'in' THEN
      open_in_id := r.id;
      open_in_time := r.punch_time;
    ELSE
      v_wdate := public.hr_v4_window_date_of(open_in_time);
      v_minutes := GREATEST(0, (EXTRACT(EPOCH FROM (r.punch_time - open_in_time))/60)::int);
      IF v_wdate BETWEEN p_from AND p_to THEN
        SELECT COALESCE(MAX(session_no), 0) + 1 INTO v_next_session_no
          FROM public.hr_attendance_sessions
         WHERE employee_id = p_employee_id AND attendance_date = v_wdate;
        INSERT INTO public.hr_attendance_sessions
              (employee_id, attendance_date, session_no, in_punch_id, out_punch_id,
               in_time, out_time, minutes, flags)
        VALUES (p_employee_id, v_wdate, v_next_session_no, open_in_id, r.id,
                open_in_time, r.punch_time, v_minutes,
                jsonb_build_object('night_span',
                  public.hr_v4_window_date_of(r.punch_time) <> v_wdate));
      END IF;
      open_in_id := NULL; open_in_time := NULL;
    END IF;
  END LOOP;

  IF open_in_id IS NOT NULL THEN
    v_wdate := public.hr_v4_window_date_of(open_in_time);
    IF v_wdate BETWEEN p_from AND p_to THEN
      SELECT COALESCE(MAX(session_no), 0) + 1 INTO v_next_session_no
        FROM public.hr_attendance_sessions
       WHERE employee_id = p_employee_id AND attendance_date = v_wdate;
      INSERT INTO public.hr_attendance_sessions
            (employee_id, attendance_date, session_no, in_punch_id, out_punch_id,
             in_time, out_time, minutes, flags)
      VALUES (p_employee_id, v_wdate, v_next_session_no, open_in_id, NULL,
              open_in_time, NULL, NULL, jsonb_build_object('open', true));
    END IF;
  END IF;

  RETURN QUERY
  WITH days AS (
    SELECT gs::date AS d FROM generate_series(p_from, p_to, INTERVAL '1 day') gs
  ),
  sess AS (
    SELECT s.attendance_date, s.in_time, s.out_time, s.minutes
      FROM public.hr_attendance_sessions s
     WHERE s.employee_id = p_employee_id
       AND s.attendance_date BETWEEN p_from AND p_to
  ),
  sess_ordered AS (
    SELECT attendance_date, in_time, out_time, minutes,
           LAG(out_time) OVER (PARTITION BY attendance_date ORDER BY in_time) AS prev_out
      FROM sess
  ),
  breaks AS (
    SELECT attendance_date,
           GREATEST(0, EXTRACT(EPOCH FROM (in_time - prev_out))/60)::int AS gap_min,
           (prev_out AT TIME ZONE 'Asia/Kolkata')::time AS gap_start_ist_time
      FROM sess_ordered
     WHERE prev_out IS NOT NULL
  ),
  agg_sess AS (
    SELECT attendance_date,
           SUM(COALESCE(minutes,0))::int AS net_work_minutes,
           COUNT(*) FILTER (WHERE out_time IS NOT NULL)::int AS closed_count,
           COUNT(*) FILTER (WHERE out_time IS NULL)::int AS open_count,
           MIN(in_time) AS first_in,
           MAX(out_time) AS last_out,
           bool_or((in_time AT TIME ZONE 'Asia/Kolkata')::date
                   <> (COALESCE(out_time, in_time) AT TIME ZONE 'Asia/Kolkata')::date) AS night_span
      FROM sess GROUP BY attendance_date
  ),
  agg_break AS (
    SELECT attendance_date,
           SUM(gap_min)::int AS break_minutes,
           MAX(CASE WHEN gap_start_ist_time >= s_lunch_start AND gap_start_ist_time < s_lunch_end
                    THEN gap_min ELSE 0 END)::int AS lunch_minutes
      FROM breaks GROUP BY attendance_date
  ),
  agg_supp AS (
    SELECT public.hr_v4_window_date_of(p.punch_time) AS attendance_date,
           COUNT(*) FILTER (WHERE p.effective = false)::int AS suppressed_count
      FROM public.hr_attendance_punches p
     WHERE p.employee_id = p_employee_id
       AND public.hr_v4_window_date_of(p.punch_time) BETWEEN p_from AND p_to
     GROUP BY 1
  ),
  merged AS (
    SELECT d.d AS attendance_date,
           COALESCE(a.net_work_minutes, 0) AS net_work_minutes,
           COALESCE(b.break_minutes, 0) AS break_minutes,
           COALESCE(b.lunch_minutes, 0) AS lunch_minutes,
           COALESCE(a.closed_count, 0) AS session_count,
           COALESCE(a.open_count, 0) AS open_count,
           COALESCE(s.suppressed_count, 0) AS suppressed_count,
           a.first_in, a.last_out,
           COALESCE(a.night_span, false) AS night_span
      FROM days d
      LEFT JOIN agg_sess a ON a.attendance_date = d.d
      LEFT JOIN agg_break b ON b.attendance_date = d.d
      LEFT JOIN agg_supp s ON s.attendance_date = d.d
  ),
  ins_daily AS (
    INSERT INTO public.hr_attendance_daily AS d
          (employee_id, attendance_date, first_in, last_out, total_hours, punch_count,
           status, net_work_minutes, break_minutes, lunch_minutes, session_count,
           suppressed_count, flags, engine_version, updated_at)
    SELECT p_employee_id, m.attendance_date, m.first_in, m.last_out,
           ROUND(m.net_work_minutes/60.0, 2),
           m.session_count * 2 + m.open_count,
           CASE
             WHEN m.net_work_minutes = 0 AND m.open_count = 0 THEN 'absent'
             WHEN m.open_count > 0 AND m.session_count = 0 THEN 'incomplete'
             WHEN m.net_work_minutes < (SELECT (half_day_net_hours*60)::int FROM public.hr_attendance_engine_settings LIMIT 1)
                  THEN 'half_day'
             ELSE 'present'
           END,
           m.net_work_minutes, m.break_minutes, m.lunch_minutes,
           m.session_count, m.suppressed_count,
           jsonb_build_object('night_span', m.night_span, 'open_sessions', m.open_count),
           'v4', now()
      FROM merged m
    ON CONFLICT (employee_id, attendance_date) DO UPDATE
       SET first_in = EXCLUDED.first_in, last_out = EXCLUDED.last_out,
           total_hours = EXCLUDED.total_hours, punch_count = EXCLUDED.punch_count,
           status = EXCLUDED.status, net_work_minutes = EXCLUDED.net_work_minutes,
           break_minutes = EXCLUDED.break_minutes, lunch_minutes = EXCLUDED.lunch_minutes,
           session_count = EXCLUDED.session_count, suppressed_count = EXCLUDED.suppressed_count,
           flags = EXCLUDED.flags, engine_version = 'v4', updated_at = now()
    RETURNING d.attendance_date, d.net_work_minutes, d.session_count, d.suppressed_count
  ),
  ins_mirror AS (
    INSERT INTO public.hr_attendance AS h
          (employee_id, attendance_date, check_in, check_out,
           attendance_status, overtime_hours, updated_at)
    SELECT p_employee_id, m.attendance_date, m.first_in, m.last_out,
           CASE
             WHEN m.net_work_minutes = 0 AND m.open_count = 0 THEN 'absent'
             WHEN m.open_count > 0 AND m.session_count = 0 THEN 'incomplete'
             WHEN m.net_work_minutes < (SELECT (half_day_net_hours*60)::int FROM public.hr_attendance_engine_settings LIMIT 1)
                  THEN 'half_day'
             ELSE 'present'
           END,
           0, now()
      FROM merged m
      WHERE m.net_work_minutes > 0 OR m.open_count > 0
    ON CONFLICT (employee_id, attendance_date) DO UPDATE
       SET check_in = EXCLUDED.check_in, check_out = EXCLUDED.check_out,
           attendance_status = EXCLUDED.attendance_status, updated_at = now()
    RETURNING 1
  )
  SELECT id.attendance_date, id.net_work_minutes, id.session_count, id.suppressed_count
    FROM ins_daily id;
END $$;
