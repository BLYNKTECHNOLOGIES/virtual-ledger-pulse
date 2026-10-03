-- 1) Leave stamping never overwrites a day the device or HR has evidence for.
CREATE OR REPLACE FUNCTION public.hr_stamp_leave_attendance(p_request_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r RECORD; d date; v_pol RECORD;
BEGIN
  SELECT * INTO r FROM public.hr_leave_requests WHERE id = p_request_id;
  IF r IS NULL OR r.start_date IS NULL OR r.end_date IS NULL THEN RETURN; END IF;
  SELECT * INTO v_pol FROM public.hr_employee_wo_policy(r.employee_id);
  d := r.start_date;
  WHILE d <= r.end_date LOOP
    IF NOT (EXTRACT(DOW FROM d)::int = ANY(v_pol.off_days))
       AND (v_pol.holidays_working
            OR NOT EXISTS (SELECT 1 FROM public.hr_holidays h WHERE h.date = d AND h.is_active = true))
    THEN
      IF r.status = 'approved' THEN
        INSERT INTO public.hr_attendance_daily
          (employee_id, attendance_date, status, punch_count, session_count, total_hours,
           net_work_minutes, engine_version, flags)
        VALUES (r.employee_id, d, 'on_leave', 0, 0, 0, 0, 'v4',
                jsonb_build_object('leave_request_id', r.id, 'auto_leave', true))
        ON CONFLICT (employee_id, attendance_date) DO UPDATE
          SET status = CASE
                -- device or HR is the source of truth: keep their status
                WHEN public.hr_attendance_daily.manual_status IS NOT NULL
                  OR COALESCE(public.hr_attendance_daily.punch_count,0) > 0
                  OR public.hr_attendance_daily.first_in IS NOT NULL
                  OR COALESCE(public.hr_attendance_daily.net_work_minutes,0) > 0
                THEN public.hr_attendance_daily.status
                ELSE 'on_leave' END,
              flags = COALESCE(public.hr_attendance_daily.flags, '{}'::jsonb)
                      || jsonb_build_object('leave_request_id', r.id, 'auto_leave', true),
              updated_at = now();
      END IF;
    END IF;
    d := d + 1;
  END LOOP;
END;
$function$;

-- 2) Worked-on-leave reconciliation: restore only the part of the leave the person
--    actually worked (device minutes or HR's day mark), re-evaluated every run.
CREATE OR REPLACE FUNCTION public.hr_reconcile_worked_leave_days(p_from date, p_to date, p_employee_id uuid DEFAULT NULL::uuid)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD; v_count int := 0; v_full int := public.hr_v4_full_day_minutes(); v_half int := public.hr_v4_half_day_minutes();
  v_worked numeric; v_leave numeric; v_want numeric; v_have numeric; v_delta numeric; v_engine text;
BEGIN
  FOR r IN
    SELECT lr.employee_id, d.attendance_date, lr.id AS leave_request_id, lr.leave_type_id,
           COALESCE(lr.is_half_day,false) AS is_half, COALESCE(d.net_work_minutes,0) AS net_min,
           d.manual_status, d.status,
           (COALESCE(d.net_work_minutes,0) > 0 OR COALESCE(d.punch_count,0) > 0 OR d.first_in IS NOT NULL) AS has_ev,
           w.days_restored AS have
      FROM public.hr_attendance_daily d
      JOIN public.hr_leave_requests lr
        ON lr.employee_id = d.employee_id AND LOWER(lr.status) = 'approved'
       AND COALESCE(lr.source, '') <> 'auto_lop_absorption'
       AND d.attendance_date BETWEEN lr.start_date AND lr.end_date
      LEFT JOIN public.hr_leave_worked_days w ON w.employee_id = d.employee_id AND w.attendance_date = d.attendance_date
     WHERE d.attendance_date BETWEEN p_from AND p_to
       AND (p_employee_id IS NULL OR d.employee_id = p_employee_id)
       AND (w.id IS NOT NULL OR d.manual_status IS NOT NULL
            OR COALESCE(d.net_work_minutes,0) > 0 OR COALESCE(d.punch_count,0) > 0 OR d.first_in IS NOT NULL)
  LOOP
    v_worked := CASE
      WHEN r.manual_status = 'present' THEN 1 WHEN r.manual_status = 'half_day' THEN 0.5
      WHEN r.manual_status = 'absent' THEN 0
      WHEN r.net_min >= v_full THEN 1 WHEN r.net_min >= v_half THEN 0.5 ELSE 0 END;
    v_leave := CASE WHEN r.is_half THEN 0.5 ELSE 1 END;
    v_want := LEAST(v_leave, GREATEST(0, v_worked + v_leave - 1));
    v_have := COALESCE(r.have, 0);
    v_delta := v_want - v_have;

    IF v_delta <> 0 AND r.leave_type_id IS NOT NULL THEN
      PERFORM public.hr_move_leave_balance(r.employee_id, r.leave_type_id, r.attendance_date, r.attendance_date,
                                           abs(v_delta), CASE WHEN v_delta > 0 THEN 1 ELSE -1 END);
    END IF;
    IF v_want > 0 THEN
      INSERT INTO public.hr_leave_worked_days
            (employee_id, attendance_date, leave_request_id, leave_type_id, days_restored, net_work_minutes)
      VALUES (r.employee_id, r.attendance_date, r.leave_request_id, r.leave_type_id, v_want, r.net_min)
      ON CONFLICT (employee_id, attendance_date) DO UPDATE
        SET days_restored = EXCLUDED.days_restored, net_work_minutes = EXCLUDED.net_work_minutes,
            leave_request_id = EXCLUDED.leave_request_id, leave_type_id = EXCLUDED.leave_type_id;
    ELSIF r.have IS NOT NULL THEN
      DELETE FROM public.hr_leave_worked_days WHERE employee_id = r.employee_id AND attendance_date = r.attendance_date;
    END IF;

    -- The day shows what the device / HR says, not a blanket "on leave".
    IF r.manual_status IS NULL AND r.status = 'on_leave' AND r.has_ev THEN
      v_engine := CASE WHEN r.net_min >= v_full THEN 'present' WHEN r.net_min >= v_half THEN 'half_day' ELSE 'absent' END;
      UPDATE public.hr_attendance_daily SET status = v_engine, updated_at = now()
       WHERE employee_id = r.employee_id AND attendance_date = r.attendance_date;
    END IF;
    UPDATE public.hr_attendance_daily
       SET flags = COALESCE(flags,'{}'::jsonb) || jsonb_build_object('worked_on_approved_leave', v_want > 0, 'leave_request_id', r.leave_request_id)
     WHERE employee_id = r.employee_id AND attendance_date = r.attendance_date;
    IF v_delta <> 0 THEN v_count := v_count + 1; END IF;
  END LOOP;
  RETURN v_count;
END $function$;

-- 3) LOP: a leave day only counts for the part not worked; a worked leave day counts its worked part.
DO $$
DECLARE src text; out text;
BEGIN
  src := pg_get_functiondef('public.hr_lop_days_window'::regproc);
  out := replace(src, $q$LOWER(COALESCE(a.manual_status, a.status,'')) AS st,$q$,
                      $q$LOWER(COALESCE(a.manual_status, a.status,'')) AS st, COALESCE(a.net_work_minutes,0) AS net_min,$q$);
  out := replace(out, $q$WHEN r.st IN ('absent','on_leave') THEN 0$q$,
    $q$WHEN r.st = 'on_leave' AND r.has_evidence THEN CASE WHEN r.net_min >= public.hr_v4_full_day_minutes() THEN 1 WHEN r.net_min >= public.hr_v4_half_day_minutes() THEN 0.5 ELSE 0 END
               WHEN r.st IN ('absent','on_leave') THEN 0$q$);
  out := replace(out, $q$SUM(CASE WHEN lv.is_half_day THEN 0.5 ELSE 1 END)::numeric AS eff_days_in_win$q$,
    $q$SUM(GREATEST((CASE WHEN lv.is_half_day THEN 0.5 ELSE 1 END) - COALESCE(wk.days_restored,0), 0))::numeric AS eff_days_in_win$q$);
  out := replace(out, $q$JOIN cal c ON c.emp_id = lv.emp_id AND c.dt = d::date AND c.is_working = true AND c.in_window = true$q$,
    $q$JOIN cal c ON c.emp_id = lv.emp_id AND c.dt = d::date AND c.is_working = true AND c.in_window = true
    LEFT JOIN public.hr_leave_worked_days wk ON wk.employee_id = lv.emp_id AND wk.attendance_date = d::date$q$);
  out := regexp_replace(out, 'AND NOT EXISTS \(\s*SELECT 1 FROM public\.hr_leave_worked_days w\s*WHERE w\.employee_id = lv\.emp_id AND w\.attendance_date = d::date\s*\)', '');
  IF out = src OR position('wk.days_restored' in out) = 0 OR position('net_min >=' in out) = 0
     OR position('hr_leave_worked_days w\n' in out) > 0 OR out ~ 'NOT EXISTS \(\s*SELECT 1 FROM public\.hr_leave_worked_days' THEN
    RAISE EXCEPTION 'hr_lop_days_window rewrite did not apply cleanly';
  END IF;
  EXECUTE out;
END $$;