
-- =========================================================================
-- Fix 1 + 2: fn_validate_leave_balance
--   * Recompute total_days BEFORE returning for LOP (strip weekends/holidays)
--   * Add FOR UPDATE on hr_leave_allocations reads to serialize approvals
-- =========================================================================
CREATE OR REPLACE FUNCTION public.fn_validate_leave_balance()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_available numeric;
  v_leave_code text;
  v_quarter_start int;
  v_quarter_end int;
  v_computed_days numeric;
  v_q1_boundary date;
  v_days_in_q1 numeric;
  v_days_in_q2 numeric;
  v_avail_q1 numeric;
  v_avail_q2 numeric;
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    SELECT code INTO v_leave_code FROM hr_leave_types WHERE id = NEW.leave_type_id;

    -- CLAIM 1 FIX: recompute server-side day count for ALL leave types (including LOP)
    -- so weekends/holidays never get counted as paid presence downstream.
    IF NEW.is_half_day = true THEN
      v_computed_days := 0.5;
    ELSE
      v_computed_days := fn_calculate_working_days(NEW.employee_id, NEW.start_date, NEW.end_date);
    END IF;

    IF v_computed_days > 0 AND v_computed_days <> NEW.total_days THEN
      RAISE WARNING 'Correcting total_days from % to % (server-computed)', NEW.total_days, v_computed_days;
      NEW.total_days := v_computed_days;
    END IF;

    -- LOP still skips balance checks (no allocation bucket to consume), but with corrected days.
    IF v_leave_code = 'LOP' THEN
      RETURN NEW;
    END IF;

    v_quarter_start := CEIL(EXTRACT(MONTH FROM NEW.start_date) / 3.0)::int;
    v_quarter_end   := CEIL(EXTRACT(MONTH FROM NEW.end_date) / 3.0)::int;

    -- Cross-quarter within same year
    IF EXTRACT(YEAR FROM NEW.start_date) = EXTRACT(YEAR FROM NEW.end_date)
       AND v_quarter_start <> v_quarter_end THEN

      v_q1_boundary := make_date(
        EXTRACT(YEAR FROM NEW.start_date)::int,
        (v_quarter_start * 3 + 1),
        1
      );

      v_days_in_q1 := fn_calculate_working_days(NEW.employee_id, NEW.start_date, v_q1_boundary - 1);
      v_days_in_q2 := NEW.total_days - v_days_in_q1;

      -- CLAIM 2 FIX: lock the allocation row while we check + until the commit that deducts
      SELECT available_days INTO v_avail_q1
      FROM hr_leave_allocations
      WHERE employee_id = NEW.employee_id
        AND leave_type_id = NEW.leave_type_id
        AND year = EXTRACT(YEAR FROM NEW.start_date)::int
        AND quarter = v_quarter_start
      FOR UPDATE;

      IF v_avail_q1 IS NULL THEN
        RAISE EXCEPTION 'No leave allocation for year % quarter %', EXTRACT(YEAR FROM NEW.start_date)::int, v_quarter_start;
      END IF;
      IF v_avail_q1 < v_days_in_q1 THEN
        RAISE EXCEPTION 'Insufficient Q% balance. Available: %, Needed: %', v_quarter_start, v_avail_q1, v_days_in_q1;
      END IF;

      SELECT available_days INTO v_avail_q2
      FROM hr_leave_allocations
      WHERE employee_id = NEW.employee_id
        AND leave_type_id = NEW.leave_type_id
        AND year = EXTRACT(YEAR FROM NEW.end_date)::int
        AND quarter = v_quarter_end
      FOR UPDATE;

      IF v_avail_q2 IS NULL THEN
        RAISE EXCEPTION 'No leave allocation for year % quarter %', EXTRACT(YEAR FROM NEW.end_date)::int, v_quarter_end;
      END IF;
      IF v_avail_q2 < v_days_in_q2 THEN
        RAISE EXCEPTION 'Insufficient Q% balance. Available: %, Needed: %', v_quarter_end, v_avail_q2, v_days_in_q2;
      END IF;

      RETURN NEW;
    END IF;

    -- Single-quarter path
    SELECT available_days INTO v_available
    FROM hr_leave_allocations
    WHERE employee_id = NEW.employee_id
      AND leave_type_id = NEW.leave_type_id
      AND year = EXTRACT(YEAR FROM NEW.start_date)::int
      AND quarter = v_quarter_start
    FOR UPDATE;

    IF v_available IS NULL THEN
      RAISE EXCEPTION 'No leave allocation found for this employee and leave type for year % quarter %', EXTRACT(YEAR FROM NEW.start_date)::int, v_quarter_start;
    END IF;

    IF v_available < NEW.total_days THEN
      RAISE EXCEPTION 'Insufficient leave balance. Available: %, Requested: %', v_available, NEW.total_days;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- =========================================================================
-- Fix 3 + 4: auto_track_late_early
--   * Resolve shift for the punch date from hr_employee_shift_schedule (fallback to work_info)
--   * Use full timestamps so overnight shifts (end_time <= start_time) compute correctly
-- =========================================================================
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

  -- CLAIM 4 FIX: date-resolved shift from hr_employee_shift_schedule first
  SELECT shift_id INTO v_shift_id
  FROM public.hr_employee_shift_schedule
  WHERE employee_id = NEW.employee_id
    AND effective_from <= v_att_date
    AND (effective_to IS NULL OR effective_to >= v_att_date)
  ORDER BY effective_from DESC
  LIMIT 1;

  IF v_shift_id IS NULL THEN
    SELECT shift_id INTO v_shift_id
    FROM public.hr_employee_work_info
    WHERE employee_id = NEW.employee_id
    LIMIT 1;
  END IF;

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

  -- CLAIM 3 FIX: overnight-aware expected timestamps (IST-anchored to match punches)
  v_is_overnight := v_shift.end_time <= v_shift.start_time;
  v_expected_start := (v_att_date::text || ' ' || v_shift.start_time::text)::timestamp AT TIME ZONE 'Asia/Kolkata';
  v_expected_end   := (v_att_date::text || ' ' || v_shift.end_time::text)::timestamp AT TIME ZONE 'Asia/Kolkata';
  IF v_is_overnight THEN
    v_expected_end := v_expected_end + INTERVAL '1 day';
  END IF;

  IF NEW.check_in IS NOT NULL THEN
    v_late_mins := (EXTRACT(EPOCH FROM (NEW.check_in - v_expected_start)) / 60)::int;
    -- Overnight guardrail: if check-in is in the morning of the following day but
    -- the shift actually started the previous evening, the raw diff is small/positive.
    -- If check-in is BEFORE the anchored start by more than 12h, we recorded on the wrong day.
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
    -- Same guardrail for cross-midnight check-outs
    IF v_early_mins < -720 THEN
      v_early_mins := v_early_mins + 1440;
    ELSIF v_early_mins > 720 THEN
      v_early_mins := v_early_mins - 1440;
    END IF;

    IF v_early_mins > 0 THEN
      NEW.early_leave_minutes := v_early_mins;
    ELSE
      NEW.early_leave_minutes := 0;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
