
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

    INSERT INTO public.hr_attendance_daily (
      employee_id, attendance_date, first_in, last_out,
      total_hours, punch_count, status, updated_at
    ) VALUES (
      p_employee_id, r.attendance_date, r.first_in,
      CASE WHEN r.punch_count > 1 THEN r.last_out ELSE NULL END,
      v_total_hours, r.punch_count,
      CASE WHEN r.punch_count = 1 THEN 'incomplete' ELSE 'present' END,
      now()
    )
    ON CONFLICT (employee_id, attendance_date) DO UPDATE
      SET first_in    = LEAST(public.hr_attendance_daily.first_in, EXCLUDED.first_in),
          last_out    = GREATEST(COALESCE(public.hr_attendance_daily.last_out, EXCLUDED.last_out), EXCLUDED.last_out),
          punch_count = EXCLUDED.punch_count,
          total_hours = EXCLUDED.total_hours,
          status      = CASE WHEN EXCLUDED.punch_count = 1 AND public.hr_attendance_daily.status IS NULL
                              THEN 'incomplete'
                              ELSE public.hr_attendance_daily.status END,
          updated_at  = now();

    INSERT INTO public.hr_attendance (
      employee_id, attendance_date, check_in, check_out, attendance_status, updated_at
    ) VALUES (
      p_employee_id, r.attendance_date, r.first_in,
      CASE WHEN r.punch_count > 1 THEN r.last_out ELSE NULL END,
      CASE WHEN r.punch_count = 1 THEN 'incomplete' ELSE 'present' END,
      now()
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

GRANT EXECUTE ON FUNCTION public.hr_rebuild_attendance_daily_range(uuid, date, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.hr_replay_quarantine_on_mapping()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q RECORD;
  new_punch_id UUID;
  emp_badge TEXT;
  v_min_date date;
  v_max_date date;
BEGIN
  IF NEW.matched_employee_id IS NULL THEN RETURN NEW; END IF;
  IF OLD.matched_employee_id IS NOT DISTINCT FROM NEW.matched_employee_id THEN RETURN NEW; END IF;

  SELECT badge_id INTO emp_badge FROM public.hr_employees WHERE id = NEW.matched_employee_id;

  FOR q IN
    SELECT * FROM public.hr_attendance_quarantine
    WHERE device_serial = NEW.device_serial
      AND pin = NEW.pin
      AND replayed_at IS NULL
    ORDER BY punch_time ASC
  LOOP
    INSERT INTO public.hr_attendance_punches (
      badge_id, employee_id, punch_time, punch_type, device_name, device_serial, raw_status
    ) VALUES (
      COALESCE(emp_badge, q.pin), NEW.matched_employee_id, q.punch_time,
      COALESCE(q.punch_type, 'in'), 'eSSL Push (replayed)', q.device_serial, q.raw_status
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO new_punch_id;

    UPDATE public.hr_attendance_quarantine
       SET replayed_at = now(), replayed_punch_id = new_punch_id
     WHERE id = q.id;

    v_min_date := LEAST(COALESCE(v_min_date, (q.punch_time AT TIME ZONE 'Asia/Kolkata')::date),
                        (q.punch_time AT TIME ZONE 'Asia/Kolkata')::date);
    v_max_date := GREATEST(COALESCE(v_max_date, (q.punch_time AT TIME ZONE 'Asia/Kolkata')::date),
                           (q.punch_time AT TIME ZONE 'Asia/Kolkata')::date);
  END LOOP;

  -- Rebuild the daily rollup once per affected date (N2/N3 fix).
  IF v_min_date IS NOT NULL THEN
    PERFORM public.hr_rebuild_attendance_daily_range(NEW.matched_employee_id, v_min_date, v_max_date);
  END IF;

  -- Queue ATTLOG re-query using the ACTUAL column + status the poll handler serves (N1 fix).
  INSERT INTO public.hr_biometric_device_commands (
    device_serial, command_text, status, created_at
  ) VALUES (
    NEW.device_serial,
    'C:' || floor(extract(epoch from now())*1000)::bigint || ':DATA QUERY ATTLOG StartTime='
      || to_char((now() AT TIME ZONE 'Asia/Kolkata') - INTERVAL '30 days', 'YYYY-MM-DD HH24:MI:SS')
      || ' EndTime=' || to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS'),
    'pending',
    now()
  );

  RETURN NEW;
END;
$$;
