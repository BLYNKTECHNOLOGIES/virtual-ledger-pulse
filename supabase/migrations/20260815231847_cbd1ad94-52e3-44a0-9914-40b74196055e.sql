DROP FUNCTION IF EXISTS public.hr_v4_detect_shift(uuid, date, timestamptz);

CREATE OR REPLACE FUNCTION public.hr_v4_detect_shift(
  p_employee_id uuid,
  p_date date,
  p_first_in timestamptz,
  p_last_out timestamptz DEFAULT NULL
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
  v_out_min int;
  v_assigned_start time;
  v_assigned_grace int;
  v_policy_grace int;
  v_assigned_dev int;
  v_best_id uuid;
  v_best_dev int;
  v_best_end time;
  v_out_dev int;
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
  IF p_last_out IS NOT NULL THEN
    v_out_min := (EXTRACT(HOUR FROM (p_last_out AT TIME ZONE 'Asia/Kolkata'))*60
                + EXTRACT(MINUTE FROM (p_last_out AT TIME ZONE 'Asia/Kolkata')))::int;
  END IF;

  IF v_assigned IS NOT NULL THEN
    SELECT s.start_time, COALESCE(s.grace_period_minutes, 0)
      INTO v_assigned_start, v_assigned_grace
      FROM public.hr_shifts s WHERE s.id = v_assigned;
  END IF;

  IF v_assigned_start IS NULL THEN
    SELECT s.id, s.end_time,
           LEAST(
             ABS(v_in_min - (EXTRACT(HOUR FROM s.start_time)*60 + EXTRACT(MINUTE FROM s.start_time))::int),
             1440 - ABS(v_in_min - (EXTRACT(HOUR FROM s.start_time)*60 + EXTRACT(MINUTE FROM s.start_time))::int)
           )::int AS dev
      INTO v_best_id, v_best_end, v_best_dev
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

  IF v_assigned_dev <= COALESCE(v_assigned_grace, 0) + v_tol THEN
    RETURN QUERY SELECT v_assigned, v_assigned, 'assigned'::text;
    RETURN;
  END IF;

  SELECT s.id, s.end_time,
         LEAST(
           ABS(v_in_min - (EXTRACT(HOUR FROM s.start_time)*60 + EXTRACT(MINUTE FROM s.start_time))::int),
           1440 - ABS(v_in_min - (EXTRACT(HOUR FROM s.start_time)*60 + EXTRACT(MINUTE FROM s.start_time))::int)
         )::int AS dev
    INTO v_best_id, v_best_end, v_best_dev
    FROM public.hr_shifts s
   WHERE s.is_active = true
   ORDER BY dev ASC, (s.id = v_assigned) DESC
   LIMIT 1;

  -- Corroboration guard: a different shift may only be adopted when the
  -- departure punch is also consistent with that shift's end time.
  IF v_best_id IS NOT NULL
     AND v_best_id <> v_assigned
     AND v_out_min IS NOT NULL THEN
    v_out_dev := LEAST(
      ABS(v_out_min - (EXTRACT(HOUR FROM v_best_end)*60 + EXTRACT(MINUTE FROM v_best_end))::int),
      1440 - ABS(v_out_min - (EXTRACT(HOUR FROM v_best_end)*60 + EXTRACT(MINUTE FROM v_best_end))::int)
    )::int;
    IF v_out_dev > v_tol THEN
      RETURN QUERY SELECT v_assigned, v_assigned, 'assigned'::text;
      RETURN;
    END IF;
  END IF;

  IF v_best_id IS NOT NULL
     AND v_best_id <> v_assigned
     AND v_best_dev <= v_tol
     AND v_best_dev + 60 < v_assigned_dev THEN
    RETURN QUERY SELECT v_best_id, v_assigned, 'detected_mismatch'::text;
  ELSE
    RETURN QUERY SELECT v_assigned, v_assigned, 'assigned'::text;
  END IF;
END $function$;

-- Pass the departure punch through from the engine
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
    FROM public.hr_v4_detect_shift(NEW.employee_id, v_att_date, NEW.check_in, NEW.check_out) det;

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