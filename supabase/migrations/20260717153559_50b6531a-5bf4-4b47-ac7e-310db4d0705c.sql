
CREATE OR REPLACE FUNCTION public.hr_rebuild_attendance_daily_range(
  p_employee_id uuid,
  p_date_from date,
  p_date_to date
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  n INT := 0;
  v_total_hours numeric;
  v_status text;
BEGIN
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
