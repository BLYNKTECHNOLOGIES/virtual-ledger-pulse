
-- 1) Shift detection helper -------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_v4_detect_shift(
  p_employee_id uuid,
  p_date date,
  p_first_in timestamptz
)
RETURNS TABLE(shift_id uuid, assigned_shift_id uuid, shift_source text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_assigned uuid;
  v_tol int;
  v_in_min int;
  v_assigned_start time;
  v_assigned_grace int;
  v_policy_grace int;
  v_assigned_dev int;
  v_best_id uuid;
  v_best_dev int;
BEGIN
  v_assigned := public.hr_v4_resolve_shift(p_employee_id, p_date);
  IF v_assigned IS NULL THEN
    SELECT w.shift_id INTO v_assigned
      FROM public.hr_employee_work_info w
     WHERE w.employee_id = p_employee_id
     LIMIT 1;
  END IF;

  IF p_first_in IS NULL THEN
    RETURN QUERY SELECT v_assigned, v_assigned, 'assigned'::text;
    RETURN;
  END IF;

  SELECT COALESCE(shift_match_tolerance_hours, 3) * 60 INTO v_tol
    FROM public.hr_attendance_engine_settings LIMIT 1;
  v_tol := COALESCE(v_tol, 180);

  v_in_min := (EXTRACT(HOUR FROM (p_first_in AT TIME ZONE 'Asia/Kolkata'))*60
             + EXTRACT(MINUTE FROM (p_first_in AT TIME ZONE 'Asia/Kolkata')))::int;

  -- deviation of the assigned shift (circular, minutes)
  IF v_assigned IS NOT NULL THEN
    SELECT s.start_time, COALESCE(s.grace_period_minutes, 0)
      INTO v_assigned_start, v_assigned_grace
      FROM public.hr_shifts s WHERE s.id = v_assigned;
  END IF;

  IF v_assigned_start IS NULL THEN
    -- no assigned shift at all: fall back to nearest active shift within tolerance
    SELECT s.id,
           LEAST(
             ABS(v_in_min - (EXTRACT(HOUR FROM s.start_time)*60 + EXTRACT(MINUTE FROM s.start_time))::int),
             1440 - ABS(v_in_min - (EXTRACT(HOUR FROM s.start_time)*60 + EXTRACT(MINUTE FROM s.start_time))::int)
           )::int AS dev
      INTO v_best_id, v_best_dev
      FROM public.hr_shifts s
     WHERE s.is_active = true
     ORDER BY dev ASC
     LIMIT 1;

    IF v_best_id IS NOT NULL AND v_best_dev <= v_tol THEN
      RETURN QUERY SELECT v_best_id, v_assigned, 'detected_unassigned'::text;
    ELSE
      RETURN QUERY SELECT v_assigned, v_assigned, 'assigned'::text;
    END IF;
    RETURN;
  END IF;

  IF COALESCE(v_assigned_grace, 0) = 0 THEN
    SELECT COALESCE(grace_period_minutes, 0) INTO v_policy_grace
      FROM public.hr_attendance_policies WHERE is_default = true LIMIT 1;
    v_assigned_grace := COALESCE(v_policy_grace, 0);
  END IF;

  v_assigned_dev := LEAST(
    ABS(v_in_min - (EXTRACT(HOUR FROM v_assigned_start)*60 + EXTRACT(MINUTE FROM v_assigned_start))::int),
    1440 - ABS(v_in_min - (EXTRACT(HOUR FROM v_assigned_start)*60 + EXTRACT(MINUTE FROM v_assigned_start))::int)
  )::int;

  -- Within grace + tolerance of the assigned shift => keep assigned (normal lateness stays lateness)
  IF v_assigned_dev <= COALESCE(v_assigned_grace, 0) + v_tol THEN
    RETURN QUERY SELECT v_assigned, v_assigned, 'assigned'::text;
    RETURN;
  END IF;

  SELECT s.id,
         LEAST(
           ABS(v_in_min - (EXTRACT(HOUR FROM s.start_time)*60 + EXTRACT(MINUTE FROM s.start_time))::int),
           1440 - ABS(v_in_min - (EXTRACT(HOUR FROM s.start_time)*60 + EXTRACT(MINUTE FROM s.start_time))::int)
         )::int AS dev
    INTO v_best_id, v_best_dev
    FROM public.hr_shifts s
   WHERE s.is_active = true
   ORDER BY dev ASC, (s.id = v_assigned) DESC
   LIMIT 1;

  IF v_best_id IS NOT NULL
     AND v_best_id <> v_assigned
     AND v_best_dev <= v_tol
     AND v_best_dev + 60 < v_assigned_dev THEN
    RETURN QUERY SELECT v_best_id, v_assigned, 'detected_mismatch'::text;
  ELSE
    RETURN QUERY SELECT v_assigned, v_assigned, 'assigned'::text;
  END IF;
END $function$;

-- 2) Recompute engine now judges each day by the detected shift -------------
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
  s_watchdog_hours numeric;
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
  v_gap_hours numeric;
BEGIN
  SELECT debounce_seconds, day_cutoff_ist, lunch_window_start_ist, lunch_window_end_ist,
         (two_device_cutover_utc AT TIME ZONE 'Asia/Kolkata')::date,
         COALESCE(ot_daily_hours, 9), COALESCE(watchdog_hours, 14)
    INTO s_debounce, s_cutoff, s_lunch_start, s_lunch_end, s_cutover_date, s_ot_daily, s_watchdog_hours
    FROM public.hr_attendance_engine_settings LIMIT 1;
  IF s_debounce IS NULL THEN
    s_debounce := 15; s_cutoff := '05:00'; s_lunch_start := '12:00'; s_lunch_end := '15:00';
    s_cutover_date := '2026-07-17'::date; s_ot_daily := 9; s_watchdog_hours := 14;
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
      IF open_in_id IS NOT NULL THEN
        v_gap_hours := EXTRACT(EPOCH FROM (r.punch_time - open_in_time)) / 3600.0;
        IF v_gap_hours > s_watchdog_hours THEN
          open_in_id := NULL;
          open_in_time := NULL;
        ELSE
          v_reason := 'redundant_in';
        END IF;
      END IF;
    ELSE
      IF open_in_id IS NULL THEN
        v_reason := 'orphan_out';
      ELSE
        v_gap_hours := EXTRACT(EPOCH FROM (r.punch_time - open_in_time)) / 3600.0;
        IF v_gap_hours > s_watchdog_hours THEN
          v_reason := 'orphan_out';
        END IF;
      END IF;
    END IF;

    v_wdate := public.hr_v4_window_date_of(r.punch_time);

    IF v_reason IS NOT NULL THEN
      IF v_wdate BETWEEN p_from AND p_to
         AND NOT public.hr_v4_is_window_locked(v_wdate) THEN
        UPDATE public.hr_attendance_punches
           SET effective = false, suppressed_reason = v_reason
         WHERE id = r.id;
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
      IF v_wdate BETWEEN p_from AND p_to
         AND NOT public.hr_v4_is_window_locked(v_wdate) THEN
        v_minutes := GREATEST(0, (EXTRACT(EPOCH FROM (r.punch_time - open_in_time)) / 60)::int);
        SELECT COALESCE(MAX(session_no), 0) + 1 INTO v_next_session_no
          FROM public.hr_attendance_sessions
         WHERE employee_id = p_employee_id AND attendance_date = v_wdate;
        INSERT INTO public.hr_attendance_sessions
              (employee_id, attendance_date, session_no, in_punch_id, out_punch_id,
               in_time, out_time, minutes)
        VALUES (p_employee_id, v_wdate, v_next_session_no, open_in_id, r.id,
                open_in_time, r.punch_time, v_minutes);
      END IF;
      open_in_id := NULL;
      open_in_time := NULL;
    END IF;
  END LOOP;

  IF open_in_id IS NOT NULL THEN
    v_wdate := public.hr_v4_window_date_of(open_in_time);
    IF v_wdate BETWEEN p_from AND p_to
       AND NOT public.hr_v4_is_window_locked(v_wdate) THEN
      SELECT COALESCE(MAX(session_no), 0) + 1 INTO v_next_session_no
        FROM public.hr_attendance_sessions
       WHERE employee_id = p_employee_id AND attendance_date = v_wdate;
      INSERT INTO public.hr_attendance_sessions
            (employee_id, attendance_date, session_no, in_punch_id, out_punch_id,
             in_time, out_time, minutes)
      VALUES (p_employee_id, v_wdate, v_next_session_no, open_in_id, NULL,
              open_in_time, NULL, NULL);
    END IF;
  END IF;

  RETURN QUERY
  WITH days AS (
    SELECT gs::date AS d FROM generate_series(p_from, p_to, interval '1 day') gs
    WHERE NOT public.hr_v4_is_window_locked(gs::date)
  ),
  sess AS (
    SELECT s.* FROM public.hr_attendance_sessions s
     WHERE s.employee_id = p_employee_id
       AND s.attendance_date BETWEEN p_from AND p_to
  ),
  breaks AS (
    SELECT attendance_date,
           (EXTRACT(EPOCH FROM (in_time - LAG(out_time) OVER (PARTITION BY attendance_date ORDER BY in_time)))/60)::int AS gap_min,
           (LAG(out_time) OVER (PARTITION BY attendance_date ORDER BY in_time) AT TIME ZONE 'Asia/Kolkata')::time AS gap_start_ist_time
      FROM sess
  ),
  agg_sess AS (
    SELECT attendance_date,
           COALESCE(SUM(minutes), 0)::int AS net_work_minutes,
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
             WHEN m.net_work_minutes = 0 AND m.open_count = 0 THEN 'no_data'
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
           status = CASE
                      WHEN EXCLUDED.status = 'no_data'
                       AND d.status IS NOT NULL
                       AND d.status NOT IN ('no_data')
                        THEN d.status
                      ELSE EXCLUDED.status
                    END,
           net_work_minutes = EXCLUDED.net_work_minutes,
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

  -- Shift-aware metrics: judge the day by the shift ACTUALLY worked
  WITH tgt AS (
    SELECT d.attendance_date, d.first_in, d.last_out
      FROM public.hr_attendance_daily d
     WHERE d.employee_id = p_employee_id
       AND d.attendance_date BETWEEN p_from AND p_to
       AND NOT public.hr_v4_is_window_locked(d.attendance_date)
  ),
  resolved AS (
    SELECT t.attendance_date, t.first_in, t.last_out,
           det.shift_id, det.assigned_shift_id, det.shift_source
      FROM tgt t
      LEFT JOIN LATERAL public.hr_v4_detect_shift(p_employee_id, t.attendance_date, t.first_in) det ON true
  ),
  metrics AS (
    SELECT res.attendance_date, res.shift_id, res.assigned_shift_id, res.shift_source,
           res.first_in, res.last_out, m.*
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
                   'assigned_shift_id', mx.assigned_shift_id,
                   'shift_source', mx.shift_source,
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
          SELECT d.attendance_date, d.first_in, d.last_out, det.shift_id
            FROM public.hr_attendance_daily d
            LEFT JOIN LATERAL public.hr_v4_detect_shift(p_employee_id, d.attendance_date, d.first_in) det ON true
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
  SELECT h.id, p_employee_id, 'late_come', d.attendance_date, d.late_by_minutes, 0, d.detected_shift_id, 0
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

-- 3) Legacy trigger follows the same detected shift -------------------------
CREATE OR REPLACE FUNCTION public.auto_track_late_early()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_shift_id UUID;
  v_shift RECORD;
  v_grace INTEGER;
  v_late_mins INTEGER;
  v_early_mins INTEGER;
  v_policy_grace INTEGER;
  v_expected_start TIMESTAMPTZ;
  v_expected_end TIMESTAMPTZ;
  v_is_overnight BOOLEAN;
  v_att_date DATE;
BEGIN
  v_att_date := COALESCE(NEW.attendance_date, (NEW.check_in AT TIME ZONE 'Asia/Kolkata')::date);
  IF v_att_date IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT det.shift_id INTO v_shift_id
    FROM public.hr_v4_detect_shift(NEW.employee_id, v_att_date, NEW.check_in) det;

  IF v_shift_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT start_time, end_time, grace_period_minutes
  INTO v_shift
  FROM public.hr_shifts
  WHERE id = v_shift_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF COALESCE(v_shift.grace_period_minutes, 0) > 0 THEN
    v_grace := v_shift.grace_period_minutes;
  ELSE
    SELECT COALESCE(grace_period_minutes, 0) INTO v_policy_grace
    FROM public.hr_attendance_policies
    WHERE is_default = true
    LIMIT 1;
    v_grace := COALESCE(v_policy_grace, 0);
  END IF;

  v_is_overnight := v_shift.end_time <= v_shift.start_time;
  v_expected_start := (v_att_date::text || ' ' || v_shift.start_time::text)::timestamp AT TIME ZONE 'Asia/Kolkata';
  v_expected_end   := (v_att_date::text || ' ' || v_shift.end_time::text)::timestamp AT TIME ZONE 'Asia/Kolkata';
  IF v_is_overnight THEN
    v_expected_end := v_expected_end + INTERVAL '1 day';
  END IF;

  IF NEW.check_in IS NOT NULL THEN
    v_late_mins := (EXTRACT(EPOCH FROM (NEW.check_in - v_expected_start)) / 60)::int;
    IF v_late_mins < -720 THEN
      v_late_mins := v_late_mins + 1440;
    ELSIF v_late_mins > 720 AND v_is_overnight THEN
      v_late_mins := v_late_mins - 1440;
    END IF;

    IF v_late_mins > v_grace THEN
      NEW.late_minutes := v_late_mins;
    ELSE
      NEW.late_minutes := 0;
    END IF;
  END IF;

  IF NEW.check_out IS NOT NULL THEN
    v_early_mins := (EXTRACT(EPOCH FROM (v_expected_end - NEW.check_out)) / 60)::int;
    IF v_early_mins < -720 THEN
      v_early_mins := v_early_mins + 1440;
    ELSIF v_early_mins > 720 THEN
      v_early_mins := v_early_mins - 1440;
    END IF;

    IF v_early_mins > v_grace THEN
      NEW.early_leave_minutes := v_early_mins;
    ELSE
      NEW.early_leave_minutes := 0;
    END IF;
  END IF;

  NEW.shift_id := COALESCE(NEW.shift_id, v_shift_id);

  RETURN NEW;
END;
$function$;

-- 4) Stale-session "mark shift end" uses the detected shift -----------------
CREATE OR REPLACE FUNCTION public.hr_resolve_stale_session(p_session_id uuid, p_resolution text, p_out_time timestamp with time zone DEFAULT NULL::timestamp with time zone, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_session RECORD;
  v_watchdog_hours numeric := 12;
  v_long_cap numeric := 14;
  v_capped_out timestamptz;
  v_out_punch_id uuid;
  v_wdate date;
  v_shift_id uuid;
  v_shift RECORD;
  v_exp_end timestamptz;
BEGIN
  IF p_resolution NOT IN ('set_out_time','confirm_long_shift','void','mark_shift_end') THEN
    RAISE EXCEPTION 'Invalid resolution: %', p_resolution;
  END IF;

  SELECT s.*, ss.id AS stale_id
    INTO v_session
    FROM public.hr_attendance_sessions s
    LEFT JOIN public.hr_attendance_stale_sessions ss ON ss.session_id = s.id
   WHERE s.id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found: %', p_session_id;
  END IF;
  IF v_session.out_time IS NOT NULL THEN
    RAISE EXCEPTION 'Session is already closed';
  END IF;

  SELECT COALESCE(watchdog_hours, 12), COALESCE(long_shift_cap_hours, 14)
    INTO v_watchdog_hours, v_long_cap
    FROM public.hr_attendance_engine_settings LIMIT 1;
  v_watchdog_hours := COALESCE(v_watchdog_hours, 12);
  v_long_cap := COALESCE(v_long_cap, 14);

  v_wdate := public.hr_v4_window_date_of(v_session.in_time);

  IF p_resolution = 'set_out_time' THEN
    IF p_out_time IS NULL THEN RAISE EXCEPTION 'p_out_time is required for set_out_time'; END IF;
    IF p_out_time <= v_session.in_time THEN
      RAISE EXCEPTION 'Out-time must be after in-time (in: %, out: %)', v_session.in_time, p_out_time;
    END IF;
    IF p_out_time > v_session.in_time + (v_long_cap * INTERVAL '1 hour') THEN
      RAISE EXCEPTION 'Out-time exceeds the long-shift cap of %h from the in-time', v_long_cap;
    END IF;

    INSERT INTO public.hr_attendance_punches
      (employee_id, badge_id, punch_time, punch_type, device_name, effective, suppressed_reason, verified)
    SELECT v_session.employee_id, e.badge_id, p_out_time, 'out', 'hr_manual_resolution', true, NULL, true
      FROM public.hr_employees e WHERE e.id = v_session.employee_id
    RETURNING id INTO v_out_punch_id;

    PERFORM public.hr_v4_recompute_range(v_session.employee_id, v_wdate, v_wdate);

    UPDATE public.hr_attendance_stale_sessions
       SET status = 'resolved_set_out_time',
           resolved_at = now(), resolved_by = auth.uid(),
           resolution_note = COALESCE(p_note, 'HR set out-time manually'),
           updated_at = now()
     WHERE session_id = p_session_id;

  ELSIF p_resolution = 'mark_shift_end' THEN
    SELECT det.shift_id INTO v_shift_id
      FROM public.hr_v4_detect_shift(v_session.employee_id, v_wdate, v_session.in_time) det;
    IF v_shift_id IS NULL THEN
      RAISE EXCEPTION 'No shift resolved for this employee on % — assign a shift or use Set out-time', v_wdate;
    END IF;
    SELECT start_time, end_time INTO v_shift FROM public.hr_shifts WHERE id = v_shift_id;
    v_exp_end := (v_wdate::text || ' ' || v_shift.end_time::text)::timestamp AT TIME ZONE 'Asia/Kolkata';
    IF v_shift.end_time <= v_shift.start_time THEN
      v_exp_end := v_exp_end + INTERVAL '1 day';
    END IF;
    WHILE v_exp_end <= v_session.in_time LOOP
      v_exp_end := v_exp_end + INTERVAL '1 day';
    END LOOP;
    IF v_exp_end > v_session.in_time + (v_long_cap * INTERVAL '1 hour') THEN
      v_exp_end := v_session.in_time + (v_long_cap * INTERVAL '1 hour');
    END IF;

    INSERT INTO public.hr_attendance_punches
      (employee_id, badge_id, punch_time, punch_type, device_name, effective, suppressed_reason, verified)
    SELECT v_session.employee_id, e.badge_id, v_exp_end, 'out', 'hr_shift_end_resolution', true, NULL, true
      FROM public.hr_employees e WHERE e.id = v_session.employee_id
    RETURNING id INTO v_out_punch_id;

    PERFORM public.hr_v4_recompute_range(v_session.employee_id, v_wdate, v_wdate);

    UPDATE public.hr_attendance_stale_sessions
       SET status = 'resolved_shift_end',
           resolved_at = now(), resolved_by = auth.uid(),
           resolution_note = COALESCE(p_note, format('Marked present — out set to scheduled shift end (%s); no overtime.', v_exp_end)),
           updated_at = now()
     WHERE session_id = p_session_id;

  ELSIF p_resolution = 'confirm_long_shift' THEN
    v_capped_out := v_session.in_time + (v_long_cap * INTERVAL '1 hour');

    INSERT INTO public.hr_attendance_punches
      (employee_id, badge_id, punch_time, punch_type, device_name, effective, suppressed_reason, verified)
    SELECT v_session.employee_id, e.badge_id, v_capped_out, 'out', 'hr_long_shift_confirmed', true, NULL, true
      FROM public.hr_employees e WHERE e.id = v_session.employee_id
    RETURNING id INTO v_out_punch_id;

    PERFORM public.hr_v4_recompute_range(v_session.employee_id, v_wdate, v_wdate);

    UPDATE public.hr_attendance_stale_sessions
       SET status = 'resolved_confirm_long_shift',
           resolved_at = now(), resolved_by = auth.uid(),
           resolution_note = COALESCE(p_note, format('HR confirmed long shift; out capped at %s (cap %sh); no overtime.', v_capped_out, v_long_cap)),
           updated_at = now()
     WHERE session_id = p_session_id;

  ELSIF p_resolution = 'void' THEN
    DELETE FROM public.hr_attendance_punches WHERE id = v_session.in_punch_id;

    PERFORM public.hr_v4_recompute_range(v_session.employee_id, v_wdate, v_wdate);

    UPDATE public.hr_attendance_stale_sessions
       SET status = 'resolved_voided',
           resolved_at = now(), resolved_by = auth.uid(),
           resolution_note = COALESCE(p_note, 'HR voided the session (forgotten in-punch). Day becomes unpaid unless regularized.'),
           updated_at = now()
     WHERE session_id = p_session_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'session_id', p_session_id,
    'resolution', p_resolution,
    'out_punch_id', v_out_punch_id,
    'window_date', v_wdate
  );
END;
$function$;
