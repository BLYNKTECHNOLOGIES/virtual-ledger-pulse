CREATE OR REPLACE FUNCTION public.trg_hr_legacy_follow_calendar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_cal text; v_has boolean;
BEGIN
  IF current_setting('hr.legacy_mirror', true) = 'on'
     OR current_setting('hr.legacy_routing', true) = 'on' THEN RETURN NEW; END IF;

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
    IF v_cal IS NULL THEN RETURN NULL; END IF;
    NEW.attendance_status := v_cal;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.trg_hr_legacy_follow_calendar() FROM PUBLIC, anon, authenticated;