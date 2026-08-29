
-- Central helper: the one and only grace period (default attendance policy)
CREATE OR REPLACE FUNCTION public.hr_effective_grace_minutes()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE((SELECT COALESCE(grace_period_minutes, 0)
                     FROM public.hr_attendance_policies
                    WHERE is_default = true
                    LIMIT 1), 0)
$$;

REVOKE ALL ON FUNCTION public.hr_effective_grace_minutes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_effective_grace_minutes() TO authenticated, service_role;

-- 1) v4 metrics: policy grace only
CREATE OR REPLACE FUNCTION public.hr_v4_shift_metrics(p_shift_id uuid, p_wdate date, p_first_in timestamp with time zone, p_last_out timestamp with time zone)
 RETURNS TABLE(late_minutes integer, early_minutes integer, ot_minutes integer, expected_start timestamp with time zone, expected_end timestamp with time zone, is_overnight boolean, grace_minutes integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  sh RECORD;
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

  SELECT start_time, end_time, duration_hours
    INTO sh
    FROM public.hr_shifts WHERE id = p_shift_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 0, 0, 0, NULL::timestamptz, NULL::timestamptz, false, 0;
    RETURN;
  END IF;

  -- Grace is company-wide: default attendance policy only.
  v_grace := public.hr_effective_grace_minutes();

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

    v_ot := GREATEST(0, (EXTRACT(EPOCH FROM (p_last_out - v_exp_end))/60)::int);
    v_ot := LEAST(v_ot, v_ot_cap);
  END IF;

  RETURN QUERY SELECT v_late, v_early, v_ot, v_exp_start, v_exp_end, v_overnight, v_grace;
END $function$;

-- 2) legacy trigger: policy grace only
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

  SELECT start_time, end_time
  INTO v_shift
  FROM public.hr_shifts
  WHERE id = v_shift_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_grace := public.hr_effective_grace_minutes();

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

-- 3) shift detection: use company-wide grace in the tolerance band
CREATE OR REPLACE FUNCTION public.hr_v4_detect_shift(p_employee_id uuid, p_date date, p_first_in timestamp with time zone, p_last_out timestamp with time zone DEFAULT NULL::timestamp with time zone)
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
    SELECT s.start_time INTO v_assigned_start
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

  v_assigned_grace := public.hr_effective_grace_minutes();

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
