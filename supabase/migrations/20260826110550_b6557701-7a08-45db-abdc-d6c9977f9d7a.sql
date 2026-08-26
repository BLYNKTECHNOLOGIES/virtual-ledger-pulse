-- 1) When an approved correction time coincides with an existing device punch, take
--    ownership of that punch row so it is recognised as the regularized punch.
CREATE OR REPLACE FUNCTION public.fn_apply_regularization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_badge text;
  v_span numeric;
  fmt text := 'DD Mon YYYY HH24:MI';
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    IF public.hr_v4_is_window_locked(NEW.attendance_date) THEN
      RAISE EXCEPTION
        'Attendance period for % is locked (payroll closed / period lock). Unlock the period before applying regularization.',
        to_char(NEW.attendance_date, 'DD Mon YYYY');
    END IF;

    IF NEW.requested_check_in IS NOT NULL AND NEW.requested_check_out IS NOT NULL THEN
      IF NEW.requested_check_out <= NEW.requested_check_in THEN
        NEW.requested_check_out := NEW.requested_check_out + interval '1 day';
      END IF;
      v_span := EXTRACT(EPOCH FROM (NEW.requested_check_out - NEW.requested_check_in)) / 3600.0;
      IF v_span > 18 OR v_span <= 0 THEN
        RAISE EXCEPTION
          'Cannot approve: the requested window % to % works out to %h, which is not a valid shift (max 18 hours). Ask the employee to resubmit with the correct times.',
          to_char(NEW.requested_check_in AT TIME ZONE 'Asia/Kolkata', fmt),
          to_char(NEW.requested_check_out AT TIME ZONE 'Asia/Kolkata', fmt),
          round(v_span, 2)
          USING ERRCODE = 'check_violation';
      END IF;
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
         'REGULARIZATION', NEW.id::text, 99, true, true, NULL)
      ON CONFLICT (employee_id, punch_time, punch_type) DO UPDATE
        SET effective = true, suppressed_reason = NULL, verified = true,
            device_name = 'REGULARIZATION', device_serial = NEW.id::text;
    END IF;

    IF NEW.requested_check_out IS NOT NULL THEN
      INSERT INTO public.hr_attendance_punches
        (employee_id, badge_id, punch_time, punch_type, device_name, device_serial,
         raw_status, verified, effective, suppressed_reason)
      VALUES
        (NEW.employee_id, v_badge, NEW.requested_check_out, 'out',
         'REGULARIZATION', NEW.id::text, 99, true, true, NULL)
      ON CONFLICT (employee_id, punch_time, punch_type) DO UPDATE
        SET effective = true, suppressed_reason = NULL, verified = true,
            device_name = 'REGULARIZATION', device_serial = NEW.id::text;
    END IF;

    NEW.approved_at := now();
  END IF;
  RETURN NEW;
END $function$;

-- 2) Engine: never set aside a punch that IS one of the approved correction times.
CREATE OR REPLACE FUNCTION public.hr_v4_regularization_override(p_employee_id uuid, p_punch_time timestamptz, p_device text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(p_device, '') <> 'REGULARIZATION'
     AND EXISTS (
       SELECT 1 FROM public.hr_attendance_regularization_requests g
        WHERE g.employee_id = p_employee_id
          AND g.status = 'approved'
          AND g.requested_check_in IS NOT NULL
          AND g.requested_check_out IS NOT NULL
          AND (
            g.attendance_date = public.hr_v4_window_date_of(p_punch_time)
            OR (p_punch_time > g.requested_check_in AND p_punch_time < g.requested_check_out)
          )
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.hr_attendance_regularization_requests g2
        WHERE g2.employee_id = p_employee_id
          AND g2.status = 'approved'
          AND p_punch_time IN (g2.requested_check_in, g2.requested_check_out)
     );
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_v4_regularization_override(uuid, timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hr_v4_regularization_override(uuid, timestamptz, text) TO service_role;