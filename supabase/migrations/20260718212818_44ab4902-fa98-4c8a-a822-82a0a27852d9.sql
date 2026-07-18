-- Fix 1: hr_v4_recompute_range — CTE alias `r` in Phase-2 shift-metrics blocks
-- shadows the plpgsql RECORD variable `r` (declared for the punch FOR-loop),
-- causing "record r has no field shift_id" whenever mapping changes fire the
-- hr_replay_quarantine_on_mapping trigger. Rename the two conflicting aliases.
CREATE OR REPLACE FUNCTION public.hr_v4_recompute_range(p_employee_id uuid, p_from date, p_to date)
 RETURNS TABLE(window_date date, net_work_minutes integer, session_count integer, suppressed_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  s_debounce int;
  s_cutoff time;
  s_lunch_start time;
  s_lunch_end time;
  s_cutover_date date;
  s_ot_daily numeric;
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
  v_locked_days int := 0;
BEGIN
  SELECT debounce_seconds, day_cutoff_ist, lunch_window_start_ist, lunch_window_end_ist,
         (two_device_cutover_utc AT TIME ZONE 'Asia/Kolkata')::date,
         COALESCE(ot_daily_hours, 9)
    INTO s_debounce, s_cutoff, s_lunch_start, s_lunch_end, s_cutover_date, s_ot_daily
    FROM public.hr_attendance_engine_settings LIMIT 1;
  IF s_debounce IS NULL THEN
    s_debounce := 15; s_cutoff := '05:00'; s_lunch_start := '12:00'; s_lunch_end := '15:00';
    s_cutover_date := '2026-07-17'::date; s_ot_daily := 9;
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
     AND public.hr_v4_window_date_of(p.punch_time) BETWEEN p_from AND p_to
     AND NOT public.hr_v4_is_window_locked(public.hr_v4_window_date_of(p.punch_time));

  DELETE FROM public.hr_attendance_sessions
   WHERE employee_id = p_employee_id
     AND attendance_date BETWEEN p_from AND p_to
     AND NOT public.hr_v4_is_window_locked(attendance_date);

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
      v_wdate := public.hr_v4_window_date_of(r.punch_time);
      IF v_wdate BETWEEN p_from AND p_to AND NOT public.hr_v4_is_window_locked(v_wdate) THEN
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
      IF v_wdate BETWEEN p_from AND p_to AND NOT public.hr_v4_is_window_locked(v_wdate) THEN
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
    IF v_wdate BETWEEN p_from AND p_to AND NOT public.hr_v4_is_window_locked(v_wdate) THEN
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

  FOR v_wdate IN
    SELECT gs::date FROM generate_series(p_from, p_to, INTERVAL '1 day') gs
     WHERE public.hr_v4_is_window_locked(gs::date)
  LOOP
    v_locked_days := v_locked_days + 1;
    RAISE NOTICE '[v4] Skipped locked window % for employee %', v_wdate, p_employee_id;
  END LOOP;

  RETURN QUERY
  WITH days AS (
    SELECT gs::date AS d
      FROM generate_series(p_from, p_to, INTERVAL '1 day') gs
     WHERE NOT public.hr_v4_is_window_locked(gs::date)
  ),
  sess AS (
    SELECT s.attendance_date, s.in_time, s.out_time, s.minutes
      FROM public.hr_attendance_sessions s
     WHERE s.employee_id = p_employee_id
       AND s.attendance_date BETWEEN p_from AND p_to
       AND NOT public.hr_v4_is_window_locked(s.attendance_date)
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
      FROM sess_ordered WHERE prev_out IS NOT NULL
  ),
  agg_sess AS (
    SELECT attendance_date,
           SUM(COALESCE(minutes,0))::int AS net_work_minutes,
           COUNT(*) FILTER (WHERE out_time IS NOT NULL)::int AS closed_count,
           COUNT(*) FILTER (WHERE out_time IS NULL)::int AS open_count,
           MIN(in_time) AS first_in, MAX(out_time) AS last_out,
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

  -- Phase 2 — Shift metrics (aliases renamed from `r` to `res` to avoid
  -- shadowing the plpgsql RECORD variable declared for the punch loop above).
  WITH tgt AS (
    SELECT d.attendance_date, d.first_in, d.last_out
      FROM public.hr_attendance_daily d
     WHERE d.employee_id = p_employee_id
       AND d.attendance_date BETWEEN p_from AND p_to
       AND NOT public.hr_v4_is_window_locked(d.attendance_date)
  ),
  resolved AS (
    SELECT t.attendance_date, t.first_in, t.last_out,
           public.hr_v4_resolve_shift(p_employee_id, t.attendance_date) AS shift_id
      FROM tgt t
  ),
  metrics AS (
    SELECT res.attendance_date, res.shift_id, res.first_in, res.last_out, m.*
      FROM resolved res
      LEFT JOIN LATERAL public.hr_v4_shift_metrics(res.shift_id, res.attendance_date, res.first_in, res.last_out) m ON true
  )
  UPDATE public.hr_attendance_daily d
     SET detected_shift_id = mx.shift_id,
         is_late = COALESCE(mx.late_minutes, 0) > 0,
         late_by_minutes = COALESCE(mx.late_minutes, 0),
         early_departure = COALESCE(mx.early_minutes, 0) > 0,
         early_by_minutes = COALESCE(mx.early_minutes, 0),
         flags = COALESCE(d.flags, '{}'::jsonb) ||
                 jsonb_build_object(
                   'shift_id', mx.shift_id,
                   'ot_minutes', COALESCE(mx.ot_minutes, 0),
                   'grace_minutes', COALESCE(mx.grace_minutes, 0),
                   'is_overnight_shift', COALESCE(mx.is_overnight, false),
                   'expected_start', mx.expected_start,
                   'expected_end', mx.expected_end
                 ),
         updated_at = now()
    FROM metrics mx
   WHERE d.employee_id = p_employee_id
     AND d.attendance_date = mx.attendance_date;

  UPDATE public.hr_attendance h
     SET shift_id = mx.shift_id,
         late_minutes = COALESCE(mx.late_minutes, 0),
         early_leave_minutes = COALESCE(mx.early_minutes, 0),
         overtime_hours = ROUND(COALESCE(mx.ot_minutes, 0) / 60.0, 2),
         updated_at = now()
    FROM (
      SELECT res.attendance_date, res.shift_id, m.late_minutes, m.early_minutes, m.ot_minutes
        FROM (
          SELECT d.attendance_date, d.first_in, d.last_out,
                 public.hr_v4_resolve_shift(p_employee_id, d.attendance_date) AS shift_id
            FROM public.hr_attendance_daily d
           WHERE d.employee_id = p_employee_id
             AND d.attendance_date BETWEEN p_from AND p_to
             AND NOT public.hr_v4_is_window_locked(d.attendance_date)
        ) res
        LEFT JOIN LATERAL public.hr_v4_shift_metrics(res.shift_id, res.attendance_date, res.first_in, res.last_out) m ON true
    ) mx
   WHERE h.employee_id = p_employee_id
     AND h.attendance_date = mx.attendance_date;

  DELETE FROM public.hr_late_come_early_out
   WHERE employee_id = p_employee_id
     AND attendance_date BETWEEN p_from AND p_to
     AND NOT public.hr_v4_is_window_locked(attendance_date);

  INSERT INTO public.hr_late_come_early_out
        (attendance_id, employee_id, type, attendance_date, late_minutes, early_minutes, shift_id, penalty_count)
  SELECT h.id, p_employee_id, 'late', d.attendance_date, d.late_by_minutes, 0, d.detected_shift_id, 0
    FROM public.hr_attendance_daily d
    JOIN public.hr_attendance h
      ON h.employee_id = d.employee_id AND h.attendance_date = d.attendance_date
   WHERE d.employee_id = p_employee_id
     AND d.attendance_date BETWEEN p_from AND p_to
     AND NOT public.hr_v4_is_window_locked(d.attendance_date)
     AND d.is_late = true;

  INSERT INTO public.hr_late_come_early_out
        (attendance_id, employee_id, type, attendance_date, late_minutes, early_minutes, shift_id, penalty_count)
  SELECT h.id, p_employee_id, 'early_out', d.attendance_date, 0, d.early_by_minutes, d.detected_shift_id, 0
    FROM public.hr_attendance_daily d
    JOIN public.hr_attendance h
      ON h.employee_id = d.employee_id AND h.attendance_date = d.attendance_date
   WHERE d.employee_id = p_employee_id
     AND d.attendance_date BETWEEN p_from AND p_to
     AND NOT public.hr_v4_is_window_locked(d.attendance_date)
     AND d.early_departure = true;

END $function$;

-- Fix 2: Backfill matched_employee_id on device rosters where PIN exactly
-- matches an employee badge_id. This linkes users like Vicky, Sitara whose
-- rows were created via the ACK side-effect path (which did not run auto-link).
UPDATE public.hr_biometric_device_users u
SET matched_employee_id = e.id, updated_at = now()
FROM public.hr_employees e
WHERE u.matched_employee_id IS NULL
  AND e.badge_id = u.pin;