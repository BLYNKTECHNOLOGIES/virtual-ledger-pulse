-- GAP-04: Enforce grace period precedence — shift > policy (fallback)
-- Update auto_track_late_early to use shift grace first, then policy grace as fallback

CREATE OR REPLACE FUNCTION auto_track_late_early()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_shift_id UUID;
  v_shift RECORD;
  v_check_in TIME;
  v_check_out TIME;
  v_grace INTEGER;
  v_late_mins INTEGER;
  v_early_mins INTEGER;
  v_policy_grace INTEGER;
BEGIN
  -- Get employee shift
  SELECT shift_id INTO v_shift_id
  FROM public.hr_employee_work_info
  WHERE employee_id = NEW.employee_id::TEXT
  LIMIT 1;

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

  -- Grace period precedence: Shift > Policy (fallback)
  -- Shift-level grace takes priority; policy grace is only used when shift grace is NULL or 0
  IF COALESCE(v_shift.grace_period_minutes, 0) > 0 THEN
    v_grace := v_shift.grace_period_minutes;
  ELSE
    -- Fallback to default attendance policy grace
    SELECT COALESCE(grace_period_minutes, 0) INTO v_policy_grace
    FROM public.hr_attendance_policies
    WHERE is_default = true
    LIMIT 1;
    v_grace := COALESCE(v_policy_grace, 0);
  END IF;

  DELETE FROM public.hr_late_come_early_out WHERE attendance_id = NEW.id;

  IF NEW.check_in IS NOT NULL THEN
    v_check_in := NEW.check_in::TIME;
    v_late_mins := EXTRACT(EPOCH FROM (v_check_in - v_shift.start_time)) / 60;
    IF v_late_mins > v_grace THEN
      INSERT INTO public.hr_late_come_early_out
        (attendance_id, employee_id, attendance_date, type, expected_time, actual_time, difference_minutes)
      VALUES
        (NEW.id, NEW.employee_id, NEW.attendance_date, 'late_come', v_shift.start_time, v_check_in, v_late_mins::INTEGER);
      NEW.late_minutes := v_late_mins::INTEGER;
    END IF;
  END IF;

  IF NEW.check_out IS NOT NULL THEN
    v_check_out := NEW.check_out::TIME;
    v_early_mins := EXTRACT(EPOCH FROM (v_shift.end_time - v_check_out)) / 60;
    IF v_early_mins > 0 THEN
      INSERT INTO public.hr_late_come_early_out
        (attendance_id, employee_id, attendance_date, type, expected_time, actual_time, difference_minutes)
      VALUES
        (NEW.id, NEW.employee_id, NEW.attendance_date, 'early_out', v_shift.end_time, v_check_out, v_early_mins::INTEGER);
      NEW.early_leave_minutes := v_early_mins::INTEGER;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;