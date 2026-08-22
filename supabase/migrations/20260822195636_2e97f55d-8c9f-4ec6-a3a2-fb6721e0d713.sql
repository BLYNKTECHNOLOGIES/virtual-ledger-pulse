-- 1) Normalize overnight regularization windows (out earlier than in => next calendar day)
CREATE OR REPLACE FUNCTION public.hr_normalize_regularization_times()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.requested_check_in IS NOT NULL
     AND NEW.requested_check_out IS NOT NULL
     AND NEW.requested_check_out <= NEW.requested_check_in
  THEN
    -- Only roll forward when the resulting span is a plausible shift (<= 18h)
    IF EXTRACT(EPOCH FROM ((NEW.requested_check_out + interval '1 day') - NEW.requested_check_in)) <= 18*3600 THEN
      NEW.requested_check_out := NEW.requested_check_out + interval '1 day';
    ELSE
      RAISE EXCEPTION 'Regularization check-out (%) must be after check-in (%)',
        NEW.requested_check_out, NEW.requested_check_in;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_normalize_regularization_times ON public.hr_attendance_regularization_requests;
CREATE TRIGGER trg_hr_normalize_regularization_times
BEFORE INSERT OR UPDATE OF requested_check_in, requested_check_out
ON public.hr_attendance_regularization_requests
FOR EACH ROW EXECUTE FUNCTION public.hr_normalize_regularization_times();

-- 2) Apply trigger: defensive normalization + hour-account refresh after recompute
CREATE OR REPLACE FUNCTION public.fn_apply_regularization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_badge text;
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    IF public.hr_v4_is_window_locked(NEW.attendance_date) THEN
      RAISE EXCEPTION
        'Attendance period for % is locked (payroll closed / period lock). Unlock the period before applying regularization.',
        to_char(NEW.attendance_date, 'DD Mon YYYY');
    END IF;

    -- Defensive: overnight window normalization (in case the row bypassed the BEFORE trigger)
    IF NEW.requested_check_in IS NOT NULL
       AND NEW.requested_check_out IS NOT NULL
       AND NEW.requested_check_out <= NEW.requested_check_in
       AND EXTRACT(EPOCH FROM ((NEW.requested_check_out + interval '1 day') - NEW.requested_check_in)) <= 18*3600
    THEN
      NEW.requested_check_out := NEW.requested_check_out + interval '1 day';
    END IF;

    SELECT badge_id INTO v_badge FROM public.hr_employees WHERE id = NEW.employee_id;
    IF v_badge IS NULL THEN
      RAISE EXCEPTION 'Cannot apply regularization: employee % has no badge_id', NEW.employee_id;
    END IF;

    DELETE FROM public.hr_attendance_punches
     WHERE device_name = 'REGULARIZATION'
       AND device_serial = NEW.id::text;

    IF NEW.requested_check_in IS NOT NULL THEN
      INSERT INTO public.hr_attendance_punches
        (employee_id, badge_id, punch_time, punch_type, device_name, device_serial,
         raw_status, verified, effective, suppressed_reason)
      VALUES
        (NEW.employee_id, v_badge, NEW.requested_check_in, 'in',
         'REGULARIZATION', NEW.id::text, 99, true, true, NULL);
    END IF;

    IF NEW.requested_check_out IS NOT NULL THEN
      INSERT INTO public.hr_attendance_punches
        (employee_id, badge_id, punch_time, punch_type, device_name, device_serial,
         raw_status, verified, effective, suppressed_reason)
      VALUES
        (NEW.employee_id, v_badge, NEW.requested_check_out, 'out',
         'REGULARIZATION', NEW.id::text, 99, true, true, NULL);
    END IF;

    PERFORM public.hr_v4_recompute_range(
      NEW.employee_id,
      NEW.attendance_date - 1,
      NEW.attendance_date + 1
    );

    -- Keep the monthly hour account in step with the corrected day
    BEGIN
      PERFORM public.refresh_hour_accounts(
        EXTRACT(YEAR FROM NEW.attendance_date)::int,
        EXTRACT(MONTH FROM NEW.attendance_date)::int
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    NEW.approved_at := now();
  END IF;
  RETURN NEW;
END $$;

-- 3) Hour accounts must count every worked minute, not only full-present days
CREATE OR REPLACE FUNCTION public.refresh_hour_accounts(p_year integer DEFAULT NULL::integer, p_month integer DEFAULT NULL::integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_year INTEGER := COALESCE(p_year, EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER);
  v_month INTEGER := COALESCE(p_month, EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER);
  v_month_name TEXT;
  v_period_start date; v_period_end date;
  v_rec RECORD;
  v_shift_duration_seconds INTEGER;
  v_calendar_working_days INTEGER;
  v_required_seconds INTEGER;
  v_worked_seconds INTEGER;
  v_overtime_seconds INTEGER;
  v_pending_seconds INTEGER;
BEGIN
  v_month_name := TO_CHAR(TO_DATE(v_month::TEXT, 'MM'), 'FMMonth');
  v_period_start := make_date(v_year, v_month, 1);
  v_period_end := (v_period_start + interval '1 month - 1 day')::date;

  FOR v_rec IN SELECT id AS employee_id FROM hr_employees WHERE is_active = true
  LOOP
    -- net_work_minutes is the v4 engine truth; count every day that has worked time
    SELECT COALESCE(SUM(
             CASE
               WHEN COALESCE(net_work_minutes, 0) > 0 THEN net_work_minutes * 60
               ELSE (COALESCE(total_hours, 0) * 3600)::int
             END
           ), 0)::INTEGER
      INTO v_worked_seconds
      FROM hr_attendance_daily
     WHERE employee_id = v_rec.employee_id
       AND EXTRACT(YEAR FROM attendance_date) = v_year
       AND EXTRACT(MONTH FROM attendance_date) = v_month
       AND status IN ('present','late','half_day','incomplete');

    SELECT COALESCE(s.duration_hours * 3600, 8 * 3600)::INTEGER
      INTO v_shift_duration_seconds
      FROM hr_employee_work_info wi
      JOIN hr_shifts s ON s.id = wi.shift_id
     WHERE wi.employee_id = v_rec.employee_id
     LIMIT 1;
    IF v_shift_duration_seconds IS NULL THEN v_shift_duration_seconds := 8 * 3600; END IF;

    v_calendar_working_days := fn_calculate_working_days(v_rec.employee_id, v_period_start, v_period_end);
    v_required_seconds := v_calendar_working_days * v_shift_duration_seconds;
    v_overtime_seconds := GREATEST(0, v_worked_seconds - v_required_seconds);
    v_pending_seconds := GREATEST(0, v_required_seconds - v_worked_seconds);

    INSERT INTO hr_hour_accounts (
      employee_id, month, month_sequence, year, hour_account_second, hour_pending_second, overtime_second
    ) VALUES (
      v_rec.employee_id::UUID, LOWER(v_month_name), v_month, v_year,
      v_worked_seconds, v_pending_seconds, v_overtime_seconds
    )
    ON CONFLICT (employee_id, month_sequence, year) DO UPDATE SET
      hour_account_second = EXCLUDED.hour_account_second,
      hour_pending_second = EXCLUDED.hour_pending_second,
      overtime_second = EXCLUDED.overtime_second,
      updated_at = NOW();
  END LOOP;
END; $$;