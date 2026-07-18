
CREATE OR REPLACE FUNCTION public.hr_replay_quarantine_on_mapping()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

    v_min_date := LEAST(COALESCE(v_min_date, public.hr_v4_window_date_of(q.punch_time)),
                        public.hr_v4_window_date_of(q.punch_time));
    v_max_date := GREATEST(COALESCE(v_max_date, public.hr_v4_window_date_of(q.punch_time)),
                           public.hr_v4_window_date_of(q.punch_time));
  END LOOP;

  -- Route replayed punches through the v4 engine (delegates pre-cutover to legacy internally).
  IF v_min_date IS NOT NULL THEN
    PERFORM public.hr_v4_recompute_range(NEW.matched_employee_id, v_min_date, v_max_date);
  END IF;

  -- Queue ATTLOG re-query so the terminal re-sends anything beyond push retention.
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
$function$;
