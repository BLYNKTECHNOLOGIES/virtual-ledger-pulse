CREATE OR REPLACE FUNCTION public.hr_attendance_day_detail(p_employee_id uuid, p_date date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_daily RECORD;
  v_punches_all jsonb;
  v_kept jsonb;
  v_suppressed jsonb;
  v_sessions jsonb;
  v_stale jsonb;
  v_reg jsonb;
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_lop_row RECORD;
  v_night_span boolean := false;
  v_shift_dev boolean := false;
  v_judged_shift text;
  v_assigned_shift text;
  v_shift_source text;
BEGIN
  v_window_start := ((p_date::text) || ' 05:00:00 Asia/Kolkata')::timestamptz;
  v_window_end   := (((p_date + 1)::text) || ' 05:00:00 Asia/Kolkata')::timestamptz;

  SELECT * INTO v_daily FROM public.hr_attendance_daily
   WHERE employee_id = p_employee_id AND attendance_date = p_date LIMIT 1;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', p.id, 'punch_time', p.punch_time, 'punch_type', p.punch_type,
      'device_name', p.device_name, 'device_serial', p.device_serial,
      'effective', p.effective, 'suppressed_reason', p.suppressed_reason,
      'raw_status', p.raw_status
    ) ORDER BY p.punch_time), '[]'::jsonb)
    INTO v_punches_all
    FROM public.hr_attendance_punches p
   WHERE p.employee_id = p_employee_id
     AND p.punch_time >= v_window_start
     AND p.punch_time < v_window_end;

  SELECT COALESCE(jsonb_agg(elem ORDER BY (elem->>'punch_time')), '[]'::jsonb)
    INTO v_kept
    FROM jsonb_array_elements(v_punches_all) elem
   WHERE (elem->>'effective')::boolean IS TRUE
      OR ((elem->>'effective') IS NULL AND (elem->>'suppressed_reason') IS NULL);

  SELECT COALESCE(jsonb_agg(elem ORDER BY (elem->>'punch_time')), '[]'::jsonb)
    INTO v_suppressed
    FROM jsonb_array_elements(v_punches_all) elem
   WHERE (elem->>'suppressed_reason') IS NOT NULL
      OR (elem->>'effective')::boolean IS FALSE;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', s.id, 'session_no', s.session_no,
      'in_time', s.in_time, 'out_time', s.out_time,
      'minutes', s.minutes, 'flags', s.flags,
      'is_open', s.out_time IS NULL,
      'label',
        CASE
          WHEN s.out_time IS NULL THEN
            to_char(s.in_time AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') || ' – (open)'
          ELSE
            to_char(s.in_time AT TIME ZONE 'Asia/Kolkata', 'HH24:MI')
            || ' – ' ||
            to_char(s.out_time AT TIME ZONE 'Asia/Kolkata', 'HH24:MI')
            || ' = ' ||
            (COALESCE(s.minutes,0)/60)::int || 'h ' ||
            lpad((COALESCE(s.minutes,0) % 60)::text, 2, '0') || 'm'
        END
    ) ORDER BY s.session_no), '[]'::jsonb)
    INTO v_sessions
    FROM public.hr_attendance_sessions s
   WHERE s.employee_id = p_employee_id AND s.attendance_date = p_date;

  SELECT bool_or(
    to_char(s.in_time  AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD')
    <>
    to_char(COALESCE(s.out_time, s.in_time) AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD')
  ) INTO v_night_span
  FROM public.hr_attendance_sessions s
  WHERE s.employee_id = p_employee_id AND s.attendance_date = p_date;
  v_night_span := COALESCE(v_night_span, false);

  v_shift_source := COALESCE(v_daily.flags->>'shift_source', 'assigned');
  SELECT sh.name INTO v_judged_shift FROM public.hr_shifts sh WHERE sh.id = v_daily.detected_shift_id;
  SELECT sh.name INTO v_assigned_shift FROM public.hr_shifts sh
   WHERE sh.id = COALESCE((v_daily.flags->>'assigned_shift_id')::uuid,
                          public.hr_v4_resolve_shift(p_employee_id, p_date));
  v_shift_dev := v_shift_source LIKE 'detected%';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', ss.id, 'session_id', ss.session_id, 'status', ss.status,
      'hours_open', ss.hours_open, 'resolved_at', ss.resolved_at,
      'resolution_note', ss.resolution_note
    )), '[]'::jsonb) INTO v_stale
    FROM public.hr_attendance_stale_sessions ss
   WHERE ss.employee_id = p_employee_id AND ss.attendance_date = p_date;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', r.id, 'status', r.status, 'requested_check_in', r.requested_check_in,
      'requested_check_out', r.requested_check_out, 'reason', r.reason,
      'reason_code', r.reason_code, 'approver_notes', r.approver_notes
    )), '[]'::jsonb) INTO v_reg
    FROM public.hr_attendance_regularization_requests r
   WHERE r.employee_id = p_employee_id AND r.attendance_date = p_date;

  BEGIN
    SELECT lop_days INTO v_lop_row
    FROM public.hr_lop_days(ARRAY[p_employee_id]::uuid[], p_date);
  EXCEPTION WHEN OTHERS THEN v_lop_row := NULL;
  END;

  RETURN jsonb_build_object(
    'employee_id', p_employee_id,
    'window_date', p_date,
    'window_start', v_window_start,
    'window_end', v_window_end,
    'daily', CASE WHEN v_daily.id IS NULL THEN NULL ELSE jsonb_build_object(
      'status', v_daily.status,
      'first_in', v_daily.first_in, 'last_out', v_daily.last_out,
      'total_hours', v_daily.total_hours,
      'net_work_minutes', v_daily.net_work_minutes,
      'break_minutes', v_daily.break_minutes,
      'lunch_minutes', v_daily.lunch_minutes,
      'session_count', v_daily.session_count,
      'suppressed_count', v_daily.suppressed_count,
      'is_late', v_daily.is_late, 'late_by_minutes', v_daily.late_by_minutes,
      'early_departure', v_daily.early_departure, 'early_by_minutes', v_daily.early_by_minutes,
      'engine_version', v_daily.engine_version, 'flags', v_daily.flags,
      'manual_status', v_daily.manual_status,
      'manual_status_reason', v_daily.manual_status_reason,
      'manual_status_at', v_daily.manual_status_at
    ) END,
    'punches', v_punches_all,
    'kept_punches', v_kept,
    'suppressed_punches', v_suppressed,
    'sessions', v_sessions,
    'stale_sessions', v_stale,
    'regularizations', v_reg,
    'flags', jsonb_build_object(
      'night_span', v_night_span,
      'shift_deviation', v_shift_dev,
      'judged_shift', v_judged_shift,
      'assigned_shift', v_assigned_shift,
      'shift_source', v_shift_source,
      'ot_minutes', COALESCE((v_daily.flags->>'ot_minutes')::int, 0)
    ),
    'lop_contribution', CASE
      WHEN v_lop_row.lop_days IS NULL THEN 0
      WHEN v_lop_row.lop_days::numeric >= 1 THEN 1
      WHEN v_lop_row.lop_days::numeric >= 0.5 THEN 0.5
      ELSE 0
    END
  );
END;
$fn$;