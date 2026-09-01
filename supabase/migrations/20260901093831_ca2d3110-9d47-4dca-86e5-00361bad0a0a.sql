DO $do$
DECLARE
  v_def text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'hr_v4_recompute_range';

  v_old := '  PERFORM public.hr_v4_rebuild_late_early_register(p_employee_id, p_from, p_to);';

  IF position(v_old in v_def) = 0 THEN
    RAISE EXCEPTION 'anchor not found';
  END IF;

  v_new :=
'  UPDATE public.hr_attendance_daily d
     SET early_departure = COALESCE(d.early_by_minutes, 0) > 0
   WHERE d.employee_id = p_employee_id
     AND d.attendance_date BETWEEN p_from AND p_to;

  UPDATE public.hr_attendance h
     SET shift_id = mx.shift_id,
         late_minutes = COALESCE(mx.late_minutes, 0),
         early_leave_minutes = COALESCE(mx.early_minutes, 0),
         overtime_hours = ROUND(LEAST(COALESCE(mx.ot_minutes, 0), (s_ot_daily * 60)::int) / 60.0, 2),
         updated_at = now()
    FROM (
      SELECT res.attendance_date, res.shift_id, m.late_minutes, m.early_minutes, m.ot_minutes
        FROM (
          SELECT d.attendance_date, d.first_in, d.last_out, det.shift_id
            FROM public.hr_attendance_daily d
            LEFT JOIN LATERAL public.hr_v4_detect_shift(p_employee_id, d.attendance_date, d.first_in, d.last_out) det ON true
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
  SELECT h.id, p_employee_id, ''late_come'', d.attendance_date, d.late_by_minutes, 0, d.detected_shift_id, 0
    FROM public.hr_attendance_daily d
    JOIN public.hr_attendance h
      ON h.employee_id = d.employee_id AND h.attendance_date = d.attendance_date
   WHERE d.employee_id = p_employee_id
     AND d.attendance_date BETWEEN p_from AND p_to
     AND NOT public.hr_v4_is_window_locked(d.attendance_date)
     AND d.is_late = true;

  INSERT INTO public.hr_late_come_early_out
        (attendance_id, employee_id, type, attendance_date, late_minutes, early_minutes, shift_id, penalty_count)
  SELECT h.id, p_employee_id, ''early_out'', d.attendance_date, 0, d.early_by_minutes, d.detected_shift_id, 0
    FROM public.hr_attendance_daily d
    JOIN public.hr_attendance h
      ON h.employee_id = d.employee_id AND h.attendance_date = d.attendance_date
   WHERE d.employee_id = p_employee_id
     AND d.attendance_date BETWEEN p_from AND p_to
     AND NOT public.hr_v4_is_window_locked(d.attendance_date)
     AND d.early_departure = true;';

  v_def := replace(v_def, v_old, v_new);
  EXECUTE v_def;
END
$do$;