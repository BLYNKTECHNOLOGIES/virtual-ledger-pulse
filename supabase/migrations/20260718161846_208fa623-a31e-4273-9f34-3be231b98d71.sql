
-- =====================================================================
-- CLAIM 5 + 6 FIX: fn_calculate_working_days
--   * Default Sunday-off when no weekly-off pattern is assigned
--   * Alternate weekly offs → 2nd/4th day-of-week-in-month (Indian convention)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_calculate_working_days(p_employee_id uuid, p_start date, p_end date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_calendar_days INTEGER;
  v_holidays INTEGER;
  v_weekly_offs INTEGER;
  v_pattern RECORD;
  v_day DATE;
  v_dow INTEGER;
  v_week_of_month INTEGER;
BEGIN
  v_calendar_days := (p_end - p_start) + 1;

  SELECT COUNT(*) INTO v_holidays
  FROM hr_holidays
  WHERE date BETWEEN p_start AND p_end
    AND is_active = true;

  v_weekly_offs := 0;

  SELECT wop.weekly_offs, wop.is_alternating, wop.alternate_week_offs
  INTO v_pattern
  FROM hr_employee_weekly_off ewo
  JOIN hr_weekly_off_patterns wop ON wop.id = ewo.pattern_id
  WHERE ewo.employee_id = p_employee_id
    AND ewo.is_current = true
  LIMIT 1;

  v_day := p_start;
  WHILE v_day <= p_end LOOP
    v_dow := EXTRACT(DOW FROM v_day)::INTEGER;

    IF v_pattern IS NULL THEN
      -- CLAIM 5 FIX: default to Sunday off when no pattern assigned,
      -- so payroll doesn't silently LOP-deduct every Sunday.
      IF v_dow = 0 THEN
        IF NOT EXISTS (SELECT 1 FROM hr_holidays WHERE date = v_day AND is_active = true) THEN
          v_weekly_offs := v_weekly_offs + 1;
        END IF;
      END IF;
    ELSE
      IF v_dow = ANY(v_pattern.weekly_offs::INT[]) THEN
        IF NOT EXISTS (SELECT 1 FROM hr_holidays WHERE date = v_day AND is_active = true) THEN
          v_weekly_offs := v_weekly_offs + 1;
        END IF;
      ELSIF v_pattern.is_alternating = true
            AND v_pattern.alternate_week_offs IS NOT NULL
            AND v_dow = ANY(v_pattern.alternate_week_offs::INT[]) THEN
        -- CLAIM 6 FIX: 2nd/4th occurrence of the DOW within the calendar month
        -- (Indian "2nd & 4th Saturday off" convention), not ISO-week parity.
        v_week_of_month := ((EXTRACT(DAY FROM v_day)::INTEGER - 1) / 7) + 1;
        IF v_week_of_month IN (2, 4) THEN
          IF NOT EXISTS (SELECT 1 FROM hr_holidays WHERE date = v_day AND is_active = true) THEN
            v_weekly_offs := v_weekly_offs + 1;
          END IF;
        END IF;
      END IF;
    END IF;

    v_day := v_day + 1;
  END LOOP;

  RETURN GREATEST(v_calendar_days - v_holidays - v_weekly_offs, 0);
END;
$function$;

-- =====================================================================
-- Helper: resolve an employee's weekly-off DOW set (defaulting to Sunday)
-- Used by payroll engine to decide "worked on their off day" correctly.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_employee_weekly_off_dows(p_employee_id uuid, p_date date)
 RETURNS integer[]
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pattern RECORD;
  v_week_of_month INTEGER;
  v_result INTEGER[];
BEGIN
  SELECT wop.weekly_offs, wop.is_alternating, wop.alternate_week_offs
  INTO v_pattern
  FROM hr_employee_weekly_off ewo
  JOIN hr_weekly_off_patterns wop ON wop.id = ewo.pattern_id
  WHERE ewo.employee_id = p_employee_id
    AND ewo.is_current = true
  LIMIT 1;

  IF v_pattern IS NULL THEN
    RETURN ARRAY[0]::INTEGER[]; -- default Sunday
  END IF;

  v_result := v_pattern.weekly_offs::INTEGER[];

  IF v_pattern.is_alternating = true AND v_pattern.alternate_week_offs IS NOT NULL THEN
    v_week_of_month := ((EXTRACT(DAY FROM p_date)::INTEGER - 1) / 7) + 1;
    IF v_week_of_month IN (2, 4) THEN
      v_result := v_result || (v_pattern.alternate_week_offs::INTEGER[]);
    END IF;
  END IF;

  RETURN v_result;
END;
$function$;

-- =====================================================================
-- CLAIM 5 FIX (payroll side): Sunday-OT should be "worked on weekly off",
-- not "worked on DOW=0". Patch fn_generate_payroll's snippet.
-- =====================================================================
DO $do$
DECLARE
  v_body text;
  v_new text;
  v_old_line text := 'IF v_dow = 0 THEN v_sunday_worked := v_sunday_worked + CASE WHEN v_att.attendance_status=''half_day'' THEN 0.5 ELSE 1 END; END IF;';
  v_new_line text := 'IF v_dow = ANY(fn_employee_weekly_off_dows(v_emp.id, v_att.attendance_date)) THEN v_sunday_worked := v_sunday_worked + CASE WHEN v_att.attendance_status=''half_day'' THEN 0.5 ELSE 1 END; END IF;';
BEGIN
  v_body := pg_get_functiondef('public.fn_generate_payroll'::regproc);
  IF position(v_old_line IN v_body) = 0 THEN
    RAISE NOTICE 'fn_generate_payroll: Sunday-OT snippet not found (already patched or drifted)';
    RETURN;
  END IF;
  v_new := replace(v_body, v_old_line, v_new_line);
  EXECUTE v_new;
END
$do$;

-- =====================================================================
-- CLAIM 7a FIX: auto_track_late_early — apply grace to early leave too.
-- =====================================================================
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

    -- CLAIM 7a FIX: apply the same grace window to early leave.
    IF v_early_mins > v_grace THEN
      NEW.early_leave_minutes := v_early_mins;
    ELSE
      NEW.early_leave_minutes := 0;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- =====================================================================
-- CLAIM 7b FIX: honor exclude_holiday / exclude_company_leave on leave types
-- when computing leave day counts. Add a leave-type-aware helper and use it
-- from fn_validate_leave_balance.
--
-- Flag semantics (matches Horilla convention):
--   exclude_holiday       = true  → holidays inside the leave range are NOT
--                                   counted as leave days consumed
--   exclude_company_leave = true  → weekly-offs inside the leave range are
--                                   NOT counted as leave days consumed
-- (false = count everything as leave days, i.e. calendar-day counting)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_calculate_leave_days(
  p_employee_id uuid,
  p_start date,
  p_end date,
  p_leave_type_id uuid
)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_calendar_days INTEGER;
  v_exclude_holiday BOOLEAN;
  v_exclude_company_leave BOOLEAN;
  v_holidays INTEGER := 0;
  v_weekly_offs INTEGER := 0;
  v_pattern RECORD;
  v_day DATE;
  v_dow INTEGER;
  v_week_of_month INTEGER;
BEGIN
  v_calendar_days := (p_end - p_start) + 1;

  SELECT COALESCE(exclude_holiday, false), COALESCE(exclude_company_leave, false)
  INTO v_exclude_holiday, v_exclude_company_leave
  FROM hr_leave_types WHERE id = p_leave_type_id;

  IF v_exclude_holiday THEN
    SELECT COUNT(*) INTO v_holidays
    FROM hr_holidays
    WHERE date BETWEEN p_start AND p_end AND is_active = true;
  END IF;

  IF v_exclude_company_leave THEN
    SELECT wop.weekly_offs, wop.is_alternating, wop.alternate_week_offs
    INTO v_pattern
    FROM hr_employee_weekly_off ewo
    JOIN hr_weekly_off_patterns wop ON wop.id = ewo.pattern_id
    WHERE ewo.employee_id = p_employee_id AND ewo.is_current = true
    LIMIT 1;

    v_day := p_start;
    WHILE v_day <= p_end LOOP
      v_dow := EXTRACT(DOW FROM v_day)::INTEGER;
      IF v_pattern IS NULL THEN
        IF v_dow = 0 THEN v_weekly_offs := v_weekly_offs + 1; END IF;
      ELSE
        IF v_dow = ANY(v_pattern.weekly_offs::INT[]) THEN
          v_weekly_offs := v_weekly_offs + 1;
        ELSIF v_pattern.is_alternating = true
              AND v_pattern.alternate_week_offs IS NOT NULL
              AND v_dow = ANY(v_pattern.alternate_week_offs::INT[]) THEN
          v_week_of_month := ((EXTRACT(DAY FROM v_day)::INTEGER - 1) / 7) + 1;
          IF v_week_of_month IN (2, 4) THEN
            v_weekly_offs := v_weekly_offs + 1;
          END IF;
        END IF;
      END IF;
      v_day := v_day + 1;
    END LOOP;
  END IF;

  RETURN GREATEST(v_calendar_days - v_holidays - v_weekly_offs, 0);
END;
$function$;

-- Rewire validator to use the leave-type-aware helper.
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

    IF NEW.is_half_day = true THEN
      v_computed_days := 0.5;
    ELSE
      -- CLAIM 7b FIX: honor exclude_holiday / exclude_company_leave flags
      v_computed_days := fn_calculate_leave_days(NEW.employee_id, NEW.start_date, NEW.end_date, NEW.leave_type_id);
    END IF;

    IF v_computed_days > 0 AND v_computed_days <> NEW.total_days THEN
      RAISE WARNING 'Correcting total_days from % to % (server-computed)', NEW.total_days, v_computed_days;
      NEW.total_days := v_computed_days;
    END IF;

    IF v_leave_code = 'LOP' THEN
      RETURN NEW;
    END IF;

    v_quarter_start := CEIL(EXTRACT(MONTH FROM NEW.start_date) / 3.0)::int;
    v_quarter_end   := CEIL(EXTRACT(MONTH FROM NEW.end_date) / 3.0)::int;

    IF EXTRACT(YEAR FROM NEW.start_date) = EXTRACT(YEAR FROM NEW.end_date)
       AND v_quarter_start <> v_quarter_end THEN

      v_q1_boundary := make_date(
        EXTRACT(YEAR FROM NEW.start_date)::int,
        (v_quarter_start * 3 + 1),
        1
      );

      v_days_in_q1 := fn_calculate_leave_days(NEW.employee_id, NEW.start_date, v_q1_boundary - 1, NEW.leave_type_id);
      v_days_in_q2 := NEW.total_days - v_days_in_q1;

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
