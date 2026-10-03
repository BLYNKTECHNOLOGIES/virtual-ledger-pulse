-- The calendar (hr_attendance_daily) is the single attendance truth.
-- The older hr_attendance list becomes a read-only mirror of it; HR marks
-- written through older screens are routed into the calendar as HR day marks.

CREATE OR REPLACE FUNCTION public.hr_calendar_to_legacy_status(p_status text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE lower(coalesce(p_status,''))
    WHEN 'present' THEN 'present' WHEN 'half_day' THEN 'half_day'
    WHEN 'absent' THEN 'absent' WHEN 'on_leave' THEN 'on_leave'
    WHEN 'incomplete' THEN 'incomplete' WHEN 'in_progress' THEN 'incomplete'
    ELSE NULL END
$$;

-- Lock trigger lets the mirror through (the calendar write itself was already lock-checked).
CREATE OR REPLACE FUNCTION public.fn_lock_attendance_for_completed_payroll()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_date DATE; v_locked BOOLEAN;
BEGIN
  IF current_setting('hr.legacy_mirror', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
  END IF;
  v_date := CASE WHEN TG_OP = 'DELETE' THEN OLD.attendance_date ELSE NEW.attendance_date END;
  SELECT EXISTS (SELECT 1 FROM hr_payroll_runs WHERE status = 'completed' AND is_locked = true
                  AND pay_period_start <= v_date AND pay_period_end >= v_date) INTO v_locked;
  IF v_locked THEN
    RAISE EXCEPTION 'Cannot modify attendance for %: payroll for this period is completed and locked', to_char(v_date, 'Mon YYYY');
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.hr_mirror_calendar_day(p_employee_id uuid, p_date date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_st text; v_in timestamptz; v_out timestamptz;
BEGIN
  SELECT public.hr_calendar_to_legacy_status(coalesce(manual_status, status)), first_in, last_out
    INTO v_st, v_in, v_out
    FROM public.hr_attendance_daily WHERE employee_id = p_employee_id AND attendance_date = p_date;
  PERFORM set_config('hr.legacy_mirror', 'on', true);
  BEGIN
    IF v_st IS NULL THEN
      DELETE FROM public.hr_attendance WHERE employee_id = p_employee_id AND attendance_date = p_date;
    ELSE
      INSERT INTO public.hr_attendance (employee_id, attendance_date, attendance_status, check_in, check_out)
      VALUES (p_employee_id, p_date, v_st, v_in, v_out)
      ON CONFLICT (employee_id, attendance_date) DO UPDATE
        SET attendance_status = EXCLUDED.attendance_status,
            check_in = COALESCE(EXCLUDED.check_in, public.hr_attendance.check_in),
            check_out = COALESCE(EXCLUDED.check_out, public.hr_attendance.check_out),
            updated_at = now();
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'legacy mirror failed for % %: %', p_employee_id, p_date, SQLERRM;
  END;
  PERFORM set_config('hr.legacy_mirror', 'off', true);
END $$;
REVOKE ALL ON FUNCTION public.hr_mirror_calendar_day(uuid, date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_hr_daily_mirror_legacy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_setting('hr.legacy_routing', true) = 'on' THEN RETURN NULL; END IF;
  IF TG_OP = 'DELETE' THEN
    PERFORM set_config('hr.legacy_mirror', 'on', true);
    DELETE FROM public.hr_attendance WHERE employee_id = OLD.employee_id AND attendance_date = OLD.attendance_date;
    PERFORM set_config('hr.legacy_mirror', 'off', true);
  ELSE
    PERFORM public.hr_mirror_calendar_day(NEW.employee_id, NEW.attendance_date);
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_hr_daily_mirror_legacy ON public.hr_attendance_daily;
CREATE TRIGGER trg_hr_daily_mirror_legacy
AFTER INSERT OR DELETE OR UPDATE OF status, manual_status, first_in, last_out ON public.hr_attendance_daily
FOR EACH ROW EXECUTE FUNCTION public.trg_hr_daily_mirror_legacy();

-- Writes to the old list: HR marks become calendar day marks; anything else
-- (device webhook, auto-absent job, file import) is overwritten by the calendar.
CREATE OR REPLACE FUNCTION public.trg_hr_legacy_follow_calendar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_cal text; v_has boolean;
BEGIN
  IF current_setting('hr.legacy_mirror', true) = 'on' THEN RETURN NEW; END IF;

  IF v_uid IS NOT NULL
     AND (public.hr_is_hr_staff(v_uid) OR public.has_role(v_uid, 'admin'))
     AND lower(NEW.attendance_status) IN ('present','absent','half_day')
     AND (TG_OP = 'INSERT' OR NEW.attendance_status IS DISTINCT FROM OLD.attendance_status) THEN
    PERFORM set_config('hr.legacy_routing', 'on', true);
    PERFORM public.hr_set_manual_day_status(NEW.employee_id, NEW.attendance_date,
              lower(NEW.attendance_status), coalesce(NEW.notes, 'Marked from attendance list'));
    PERFORM set_config('hr.legacy_routing', 'off', true);
  END IF;

  SELECT true, public.hr_calendar_to_legacy_status(coalesce(manual_status, status))
    INTO v_has, v_cal
    FROM public.hr_attendance_daily
   WHERE employee_id = NEW.employee_id AND attendance_date = NEW.attendance_date;

  IF coalesce(v_has, false) THEN
    IF v_cal IS NULL THEN
      RETURN NULL;           -- calendar shows nothing countable: keep no stale row
    END IF;
    NEW.attendance_status := v_cal;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_hr_legacy_follow_calendar ON public.hr_attendance;
CREATE TRIGGER trg_hr_legacy_follow_calendar
BEFORE INSERT OR UPDATE ON public.hr_attendance
FOR EACH ROW EXECUTE FUNCTION public.trg_hr_legacy_follow_calendar();