
-- 1) Route the punch-insert trigger through the v4 engine.
CREATE OR REPLACE FUNCTION public.hr_punch_daily_autorollup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE d date;
BEGIN
  IF NEW.employee_id IS NULL THEN RETURN NEW; END IF;
  d := (NEW.punch_time AT TIME ZONE 'Asia/Kolkata')::date;
  -- v4 recompute handles both eras: post-cutover uses L1–L4 net sessions;
  -- pre-cutover it internally delegates to hr_rebuild_attendance_daily_range.
  -- Look back one day to catch night-shift windows.
  PERFORM public.hr_v4_recompute_range(NEW.employee_id, d - 1, d);
  RETURN NEW;
END;
$$;

-- 2) Hard-gate the legacy span rebuilder: refuse to touch post-cutover dates.
CREATE OR REPLACE FUNCTION public.hr_rebuild_attendance_daily_range(
  p_employee_id uuid, p_date_from date, p_date_to date
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r RECORD;
  n INT := 0;
  v_total_hours numeric;
  v_status text;
  s_cutover_date date;
BEGIN
  SELECT (two_device_cutover_utc AT TIME ZONE 'Asia/Kolkata')::date
    INTO s_cutover_date
    FROM public.hr_attendance_engine_settings LIMIT 1;
  IF s_cutover_date IS NULL THEN s_cutover_date := '2026-07-17'::date; END IF;

  -- Clamp the range to strictly pre-cutover; post-cutover is v4-owned.
  IF p_date_from >= s_cutover_date THEN
    RETURN 0;
  END IF;
  IF p_date_to >= s_cutover_date THEN
    p_date_to := s_cutover_date - 1;
  END IF;

  FOR r IN
    SELECT
      (punch_time AT TIME ZONE 'Asia/Kolkata')::date AS attendance_date,
      MIN(punch_time) AS first_in,
      MAX(punch_time) AS last_out,
      COUNT(*)::int AS punch_count
    FROM public.hr_attendance_punches
    WHERE employee_id = p_employee_id
      AND (punch_time AT TIME ZONE 'Asia/Kolkata')::date BETWEEN p_date_from AND p_date_to
    GROUP BY 1
  LOOP
    v_total_hours := CASE
      WHEN r.last_out > r.first_in
        THEN ROUND(EXTRACT(EPOCH FROM (r.last_out - r.first_in))::numeric / 3600.0, 2)
      ELSE 0
    END;
    v_status := 'present';

    INSERT INTO public.hr_attendance_daily (
      employee_id, attendance_date, first_in, last_out,
      total_hours, punch_count, status, updated_at
    ) VALUES (
      p_employee_id, r.attendance_date, r.first_in,
      CASE WHEN r.punch_count > 1 THEN r.last_out ELSE NULL END,
      v_total_hours, r.punch_count, v_status, now()
    )
    ON CONFLICT (employee_id, attendance_date) DO UPDATE
      SET first_in    = LEAST(public.hr_attendance_daily.first_in, EXCLUDED.first_in),
          last_out    = GREATEST(COALESCE(public.hr_attendance_daily.last_out, EXCLUDED.last_out), EXCLUDED.last_out),
          punch_count = EXCLUDED.punch_count,
          total_hours = EXCLUDED.total_hours,
          updated_at  = now();

    INSERT INTO public.hr_attendance (
      employee_id, attendance_date, check_in, check_out, attendance_status, updated_at
    ) VALUES (
      p_employee_id, r.attendance_date, r.first_in,
      CASE WHEN r.punch_count > 1 THEN r.last_out ELSE NULL END,
      v_status, now()
    )
    ON CONFLICT (employee_id, attendance_date) DO UPDATE
      SET check_in  = LEAST(public.hr_attendance.check_in, EXCLUDED.check_in),
          check_out = GREATEST(COALESCE(public.hr_attendance.check_out, EXCLUDED.check_out), EXCLUDED.check_out),
          updated_at = now();

    n := n + 1;
  END LOOP;

  RETURN n;
END;
$$;
