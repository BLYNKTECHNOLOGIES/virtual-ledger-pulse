-- 1. New setting: configurable long-shift cap
ALTER TABLE public.hr_attendance_engine_settings
  ADD COLUMN IF NOT EXISTS long_shift_cap_hours numeric NOT NULL DEFAULT 14;

-- 2. OT clamp in shift metrics
CREATE OR REPLACE FUNCTION public.hr_v4_shift_metrics(p_shift_id uuid, p_wdate date, p_first_in timestamp with time zone, p_last_out timestamp with time zone)
 RETURNS TABLE(late_minutes integer, early_minutes integer, ot_minutes integer, expected_start timestamp with time zone, expected_end timestamp with time zone, is_overnight boolean, grace_minutes integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  sh RECORD;
  v_policy_grace int;
  v_grace int;
  v_exp_start timestamptz;
  v_exp_end   timestamptz;
  v_overnight boolean;
  v_late int := 0;
  v_early int := 0;
  v_ot int := 0;
  v_ot_cap int;
BEGIN
  IF p_shift_id IS NULL THEN
    RETURN QUERY SELECT 0, 0, 0, NULL::timestamptz, NULL::timestamptz, false, 0;
    RETURN;
  END IF;

  SELECT start_time, end_time, grace_period_minutes, duration_hours
    INTO sh
    FROM public.hr_shifts WHERE id = p_shift_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 0, 0, 0, NULL::timestamptz, NULL::timestamptz, false, 0;
    RETURN;
  END IF;

  IF COALESCE(sh.grace_period_minutes,0) > 0 THEN
    v_grace := sh.grace_period_minutes;
  ELSE
    SELECT COALESCE(grace_period_minutes,0) INTO v_policy_grace
      FROM public.hr_attendance_policies WHERE is_default = true LIMIT 1;
    v_grace := COALESCE(v_policy_grace, 0);
  END IF;

  SELECT (COALESCE(ot_daily_hours, 9) * 60)::int INTO v_ot_cap
    FROM public.hr_attendance_engine_settings LIMIT 1;
  v_ot_cap := COALESCE(v_ot_cap, 540);

  v_overnight := sh.end_time <= sh.start_time;
  v_exp_start := (p_wdate::text || ' ' || sh.start_time::text)::timestamp AT TIME ZONE 'Asia/Kolkata';
  v_exp_end   := (p_wdate::text || ' ' || sh.end_time::text)::timestamp AT TIME ZONE 'Asia/Kolkata';
  IF v_overnight THEN
    v_exp_end := v_exp_end + INTERVAL '1 day';
  END IF;

  IF p_first_in IS NOT NULL THEN
    v_late := (EXTRACT(EPOCH FROM (p_first_in - v_exp_start))/60)::int;
    IF v_late < -720 THEN v_late := v_late + 1440;
    ELSIF v_late > 720 AND v_overnight THEN v_late := v_late - 1440;
    END IF;
    IF v_late <= v_grace THEN v_late := 0; END IF;
  END IF;

  IF p_last_out IS NOT NULL THEN
    v_early := (EXTRACT(EPOCH FROM (v_exp_end - p_last_out))/60)::int;
    IF v_early < -720 THEN v_early := v_early + 1440;
    ELSIF v_early > 720 THEN v_early := v_early - 1440;
    END IF;
    IF v_early <= v_grace THEN v_early := 0; END IF;

    -- Overtime: minutes worked past expected_end, clamped to the daily OT ceiling.
    v_ot := GREATEST(0, (EXTRACT(EPOCH FROM (p_last_out - v_exp_end))/60)::int);
    v_ot := LEAST(v_ot, v_ot_cap);
  END IF;

  RETURN QUERY SELECT v_late, v_early, v_ot, v_exp_start, v_exp_end, v_overnight, v_grace;
END $function$;

-- 3. Watchdog: settings-driven window + safe candidate selection
CREATE OR REPLACE FUNCTION public.hr_watchdog_open_sessions()
 RETURNS TABLE(opened integer, refreshed integer, closed integer, auto_resolved integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_opened int := 0;
  v_refreshed int := 0;
  v_closed int := 0;
  v_auto int := 0;
  v_watchdog_hours numeric := 12;
BEGIN
  SELECT COALESCE(watchdog_hours, 12) INTO v_watchdog_hours
    FROM public.hr_attendance_engine_settings LIMIT 1;
  v_watchdog_hours := COALESCE(v_watchdog_hours, 12);

  WITH stale AS (
    SELECT s.id AS session_id,
           s.employee_id,
           s.attendance_date,
           s.in_time,
           ROUND(EXTRACT(EPOCH FROM (now() - s.in_time)) / 3600.0, 2)::numeric AS hours_open
    FROM public.hr_attendance_sessions s
    WHERE s.out_time IS NULL
      AND s.in_time < now() - (v_watchdog_hours * INTERVAL '1 hour')
  ),
  upserted AS (
    INSERT INTO public.hr_attendance_stale_sessions
      (session_id, employee_id, attendance_date, in_time, hours_open, status, first_seen_at, last_seen_at)
    SELECT session_id, employee_id, attendance_date, in_time, hours_open, 'open', now(), now()
    FROM stale
    ON CONFLICT (session_id) DO UPDATE
      SET hours_open   = EXCLUDED.hours_open,
          last_seen_at = now(),
          updated_at   = now()
    RETURNING xmax = 0 AS inserted
  )
  SELECT
    COUNT(*) FILTER (WHERE inserted),
    COUNT(*) FILTER (WHERE NOT inserted)
  INTO v_opened, v_refreshed FROM upserted;

  -- Auto-resolve: pair only a punch that is a genuine OUT candidate.
  -- NEVER consume a punch that opens a later attendance window (the next
  -- morning's first punch) — doing so inflates the prior day and erases the
  -- next day's presence.
  WITH candidates AS (
    SELECT ss.session_id,
           cand.id  AS out_pid,
           cand.punch_time AS out_ts
      FROM public.hr_attendance_stale_sessions ss
      LEFT JOIN LATERAL (
        SELECT p.id, p.punch_time
          FROM public.hr_attendance_punches p
         WHERE p.employee_id = ss.employee_id
           AND p.punch_time > ss.in_time + INTERVAL '2 minutes'
           AND p.punch_time <= ss.in_time + (v_watchdog_hours * INTERVAL '1 hour')
           AND NOT EXISTS (
             SELECT 1 FROM public.hr_attendance_sessions s2 WHERE s2.in_punch_id = p.id
           )
           -- must not be an IN punch belonging to a later attendance window
           AND NOT (
             COALESCE(p.punch_type,'in') = 'in'
             AND public.hr_v4_window_date_of(p.punch_time) <> ss.attendance_date
           )
           -- must not be the first punch of a later attendance window
           AND NOT (
             public.hr_v4_window_date_of(p.punch_time) <> ss.attendance_date
             AND p.punch_time = (
               SELECT MIN(p2.punch_time) FROM public.hr_attendance_punches p2
                WHERE p2.employee_id = ss.employee_id
                  AND public.hr_v4_window_date_of(p2.punch_time)
                      = public.hr_v4_window_date_of(p.punch_time)
             )
           )
         ORDER BY p.punch_time DESC
         LIMIT 1
      ) cand ON true
     WHERE ss.status = 'open'
  ),
  session_fix AS (
    UPDATE public.hr_attendance_sessions s
       SET out_punch_id = c.out_pid,
           out_time     = c.out_ts,
           minutes      = FLOOR(EXTRACT(EPOCH FROM (c.out_ts - s.in_time)) / 60.0)::int,
           flags        = COALESCE(s.flags, '{}'::jsonb) || jsonb_build_object(
                            'auto_paired_by_watchdog', true,
                            'auto_paired_at', now()
                          ),
           updated_at   = now()
      FROM candidates c
     WHERE s.id = c.session_id
       AND c.out_pid IS NOT NULL
    RETURNING s.id
  ),
  stale_fix AS (
    UPDATE public.hr_attendance_stale_sessions ss
       SET status          = 'auto_resolved_paired_out',
           resolved_at     = now(),
           resolution_note = 'Watchdog auto-paired a later punch as OUT (' ||
                             to_char(ss.hours_open, 'FM990.00') || 'h open). Overtime suppressed.',
           updated_at      = now()
     WHERE ss.session_id IN (SELECT id FROM session_fix)
    RETURNING ss.employee_id, ss.attendance_date
  )
  SELECT COUNT(*) INTO v_auto FROM stale_fix;

  -- Recompute the affected windows so OT suppression + daily rollups apply.
  PERFORM public.hr_v4_recompute_range(x.employee_id, x.attendance_date, x.attendance_date)
    FROM (
      SELECT DISTINCT ss.employee_id, ss.attendance_date
        FROM public.hr_attendance_stale_sessions ss
       WHERE ss.status = 'auto_resolved_paired_out'
         AND ss.resolved_at > now() - INTERVAL '2 minutes'
    ) x;

  WITH closed_rows AS (
    UPDATE public.hr_attendance_stale_sessions ss
       SET status = CASE WHEN ss.status = 'open' THEN 'resolved_set_out_time' ELSE ss.status END,
           resolved_at = COALESCE(ss.resolved_at, now()),
           resolution_note = COALESCE(ss.resolution_note, 'Auto-closed by watchdog (session now closed).'),
           updated_at = now()
     WHERE ss.status = 'open'
       AND NOT EXISTS (
         SELECT 1 FROM public.hr_attendance_sessions s
         WHERE s.id = ss.session_id AND s.out_time IS NULL
       )
     RETURNING 1
  )
  SELECT COUNT(*) INTO v_closed FROM closed_rows;

  RETURN QUERY SELECT v_opened, v_refreshed, v_closed, v_auto;
END;
$function$;

-- 4. Resolution RPC: settings-driven caps + new 'mark_shift_end' outcome
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
    v_shift_id := public.hr_v4_resolve_shift(v_session.employee_id, v_wdate);
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

-- allow the new status values
ALTER TABLE public.hr_attendance_stale_sessions
  DROP CONSTRAINT IF EXISTS hr_attendance_stale_sessions_status_check;
ALTER TABLE public.hr_attendance_stale_sessions
  ADD CONSTRAINT hr_attendance_stale_sessions_status_check
  CHECK (status IN ('open','resolved_set_out_time','resolved_confirm_long_shift','resolved_voided',
                    'auto_resolved_paired_out','resolved_shift_end'));