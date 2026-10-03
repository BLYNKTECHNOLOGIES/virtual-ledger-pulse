CREATE OR REPLACE FUNCTION public.hr_legacy_write_is_hr_mark(p_status text, p_old text, p_op text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  RETURN v_uid IS NOT NULL
     AND (public.hr_is_hr_staff(v_uid) OR public.has_role(v_uid, 'admin'))
     AND lower(coalesce(p_status,'')) IN ('present','absent','half_day')
     AND (p_op = 'INSERT' OR p_status IS DISTINCT FROM p_old);
END $$;
REVOKE EXECUTE ON FUNCTION public.hr_legacy_write_is_hr_mark(text,text,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_hr_legacy_follow_calendar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cal text; v_has boolean;
BEGIN
  IF current_setting('hr.legacy_mirror', true) = 'on'
     OR current_setting('hr.legacy_routing', true) = 'on' THEN RETURN NEW; END IF;
  -- HR's mark is kept here and pushed into the calendar by the AFTER trigger.
  IF public.hr_legacy_write_is_hr_mark(NEW.attendance_status,
        CASE WHEN TG_OP = 'UPDATE' THEN OLD.attendance_status END, TG_OP) THEN
    RETURN NEW;
  END IF;
  SELECT true, public.hr_calendar_to_legacy_status(coalesce(manual_status, status))
    INTO v_has, v_cal
    FROM public.hr_attendance_daily
   WHERE employee_id = NEW.employee_id AND attendance_date = NEW.attendance_date;
  IF coalesce(v_has, false) THEN
    IF v_cal IS NULL THEN RETURN NULL; END IF;
    NEW.attendance_status := v_cal;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.trg_hr_legacy_route_hr_mark()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_setting('hr.legacy_mirror', true) = 'on'
     OR current_setting('hr.legacy_routing', true) = 'on' THEN RETURN NULL; END IF;
  IF public.hr_legacy_write_is_hr_mark(NEW.attendance_status,
        CASE WHEN TG_OP = 'UPDATE' THEN OLD.attendance_status END, TG_OP) THEN
    PERFORM set_config('hr.legacy_routing', 'on', true);
    PERFORM public.hr_set_manual_day_status(NEW.employee_id, NEW.attendance_date,
              lower(NEW.attendance_status), coalesce(NEW.notes, 'Marked from attendance list'));
    PERFORM set_config('hr.legacy_routing', 'off', true);
    PERFORM public.hr_mirror_calendar_day(NEW.employee_id, NEW.attendance_date);
  END IF;
  RETURN NULL;
END $$;
REVOKE EXECUTE ON FUNCTION public.trg_hr_legacy_route_hr_mark() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_hr_legacy_follow_calendar() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_hr_legacy_route_hr_mark ON public.hr_attendance;
CREATE TRIGGER trg_hr_legacy_route_hr_mark
AFTER INSERT OR UPDATE OF attendance_status ON public.hr_attendance
FOR EACH ROW EXECUTE FUNCTION public.trg_hr_legacy_route_hr_mark();