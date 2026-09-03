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
  v_badge text;
  v_emp uuid;
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
    -- The session was rebuilt/removed by a recompute: the stale row is orphaned.
    UPDATE public.hr_attendance_stale_sessions
       SET status = CASE WHEN status = 'open' THEN 'resolved_stale_entry' ELSE status END,
           resolved_at = COALESCE(resolved_at, now()), resolved_by = COALESCE(resolved_by, auth.uid()),
           resolution_note = COALESCE(resolution_note, 'Session no longer exists (attendance recomputed) — entry closed.'),
           updated_at = now()
     WHERE session_id = p_session_id;
    RETURN jsonb_build_object('ok', true, 'session_id', p_session_id, 'resolution', 'stale_entry');
  END IF;

  IF v_session.out_time IS NOT NULL THEN
    UPDATE public.hr_attendance_stale_sessions
       SET status = CASE WHEN status = 'open' THEN 'resolved_set_out_time' ELSE status END,
           resolved_at = COALESCE(resolved_at, now()),
           resolution_note = COALESCE(resolution_note, 'Session already closed.'),
           updated_at = now()
     WHERE session_id = p_session_id;
    RETURN jsonb_build_object('ok', true, 'session_id', p_session_id, 'resolution', 'already_closed');
  END IF;

  v_emp := v_session.employee_id;
  SELECT badge_id INTO v_badge FROM public.hr_employees WHERE id = v_emp;

  SELECT COALESCE(watchdog_hours, 12), COALESCE(long_shift_cap_hours, 14)
    INTO v_watchdog_hours, v_long_cap
    FROM public.hr_attendance_engine_settings LIMIT 1;
  v_watchdog_hours := COALESCE(v_watchdog_hours, 12);
  v_long_cap := COALESCE(v_long_cap, 14);

  v_wdate := public.hr_v4_window_date_of(v_session.in_time);

  -- A day already governed by an approved regularization is authoritative: any
  -- punch we add would be suppressed, so close the entry instead of looping.
  IF p_resolution <> 'void'
     AND public.hr_v4_regularization_override(v_emp, v_session.in_time, 'hr_manual_resolution') THEN
    PERFORM public.hr_v4_recompute_range(v_emp, v_wdate, v_wdate);
    UPDATE public.hr_attendance_stale_sessions
       SET status = 'resolved_regularized',
           resolved_at = now(), resolved_by = auth.uid(),
           resolution_note = COALESCE(p_note, 'Day is governed by an approved regularization — attendance taken from the regularization, entry closed.'),
           updated_at = now()
     WHERE session_id = p_session_id;
    RETURN jsonb_build_object('ok', true, 'session_id', p_session_id, 'resolution', 'regularized', 'window_date', v_wdate);
  END IF;

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
    VALUES (v_emp, v_badge, p_out_time, 'out', 'hr_manual_resolution', true, NULL, true)
    ON CONFLICT (employee_id, punch_time, punch_type) DO UPDATE
      SET effective = true, suppressed_reason = NULL, verified = true
    RETURNING id INTO v_out_punch_id;

    PERFORM public.hr_v4_recompute_range(v_emp, v_wdate, v_wdate);

    UPDATE public.hr_attendance_stale_sessions
       SET status = 'resolved_set_out_time',
           resolved_at = now(), resolved_by = auth.uid(),
           resolution_note = COALESCE(p_note, 'HR set out-time manually'),
           updated_at = now()
     WHERE session_id = p_session_id;

  ELSIF p_resolution = 'mark_shift_end' THEN
    SELECT det.shift_id INTO v_shift_id
      FROM public.hr_v4_detect_shift(v_emp, v_wdate, v_session.in_time) det;
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
    VALUES (v_emp, v_badge, v_exp_end, 'out', 'hr_shift_end_resolution', true, NULL, true)
    ON CONFLICT (employee_id, punch_time, punch_type) DO UPDATE
      SET effective = true, suppressed_reason = NULL, verified = true
    RETURNING id INTO v_out_punch_id;

    PERFORM public.hr_v4_recompute_range(v_emp, v_wdate, v_wdate);

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
    VALUES (v_emp, v_badge, v_capped_out, 'out', 'hr_long_shift_confirmed', true, NULL, true)
    ON CONFLICT (employee_id, punch_time, punch_type) DO UPDATE
      SET effective = true, suppressed_reason = NULL, verified = true
    RETURNING id INTO v_out_punch_id;

    PERFORM public.hr_v4_recompute_range(v_emp, v_wdate, v_wdate);

    UPDATE public.hr_attendance_stale_sessions
       SET status = 'resolved_confirm_long_shift',
           resolved_at = now(), resolved_by = auth.uid(),
           resolution_note = COALESCE(p_note, format('HR confirmed long shift; out capped at %s (cap %sh); no overtime.', v_capped_out, v_long_cap)),
           updated_at = now()
     WHERE session_id = p_session_id;

  ELSIF p_resolution = 'void' THEN
    DELETE FROM public.hr_attendance_punches WHERE id = v_session.in_punch_id;

    PERFORM public.hr_v4_recompute_range(v_emp, v_wdate, v_wdate);

    UPDATE public.hr_attendance_stale_sessions
       SET status = 'resolved_voided',
           resolved_at = now(), resolved_by = auth.uid(),
           resolution_note = COALESCE(p_note, 'HR voided the session (forgotten in-punch). Day becomes unpaid unless regularized.'),
           updated_at = now()
     WHERE session_id = p_session_id;
  END IF;

  -- Recompute rebuilds sessions with new ids; close any orphaned stale rows for
  -- this employee/day so the queue reflects reality immediately.
  UPDATE public.hr_attendance_stale_sessions ss
     SET status = 'resolved_stale_entry',
         resolved_at = now(), resolved_by = auth.uid(),
         resolution_note = COALESCE(ss.resolution_note, 'Session rebuilt by attendance recompute — entry closed.'),
         updated_at = now()
   WHERE ss.status = 'open'
     AND ss.employee_id = v_emp
     AND ss.attendance_date = v_wdate
     AND NOT EXISTS (
       SELECT 1 FROM public.hr_attendance_sessions s
        WHERE s.id = ss.session_id AND s.out_time IS NULL
     );

  RETURN jsonb_build_object(
    'ok', true,
    'session_id', p_session_id,
    'resolution', p_resolution,
    'out_punch_id', v_out_punch_id,
    'window_date', v_wdate
  );
END;
$function$;