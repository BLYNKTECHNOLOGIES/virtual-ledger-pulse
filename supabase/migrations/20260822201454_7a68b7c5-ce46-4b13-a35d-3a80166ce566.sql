-- BEFORE trigger keeps validation + punch materialisation, but no longer recomputes
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
        SET effective = true, suppressed_reason = NULL, verified = true;
    END IF;

    IF NEW.requested_check_out IS NOT NULL THEN
      INSERT INTO public.hr_attendance_punches
        (employee_id, badge_id, punch_time, punch_type, device_name, device_serial,
         raw_status, verified, effective, suppressed_reason)
      VALUES
        (NEW.employee_id, v_badge, NEW.requested_check_out, 'out',
         'REGULARIZATION', NEW.id::text, 99, true, true, NULL)
      ON CONFLICT (employee_id, punch_time, punch_type) DO UPDATE
        SET effective = true, suppressed_reason = NULL, verified = true;
    END IF;

    NEW.approved_at := now();
  END IF;
  RETURN NEW;
END $function$;

-- AFTER trigger: recompute once the approved row (and its times) are visible to the engine
CREATE OR REPLACE FUNCTION public.fn_recompute_after_regularization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved'
      OR OLD.requested_check_in IS DISTINCT FROM NEW.requested_check_in
      OR OLD.requested_check_out IS DISTINCT FROM NEW.requested_check_out) THEN
    PERFORM public.hr_v4_recompute_range(NEW.employee_id, NEW.attendance_date - 1, NEW.attendance_date + 1);
    BEGIN
      PERFORM public.refresh_hour_accounts(
        EXTRACT(YEAR FROM NEW.attendance_date)::int,
        EXTRACT(MONTH FROM NEW.attendance_date)::int
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS trg_recompute_after_regularization ON public.hr_attendance_regularization_requests;
CREATE TRIGGER trg_recompute_after_regularization
AFTER INSERT OR UPDATE ON public.hr_attendance_regularization_requests
FOR EACH ROW EXECUTE FUNCTION public.fn_recompute_after_regularization();