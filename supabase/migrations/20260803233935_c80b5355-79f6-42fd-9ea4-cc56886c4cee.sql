-- Ensure the watchdog window can never fall back to a hardcoded value
UPDATE public.hr_attendance_engine_settings SET watchdog_hours = 12 WHERE watchdog_hours IS NULL;
ALTER TABLE public.hr_attendance_engine_settings ALTER COLUMN watchdog_hours SET DEFAULT 12;

-- Repaired sessions must never generate overtime.
CREATE OR REPLACE FUNCTION public.hr_v4_is_repaired_day(p_employee_id uuid, p_date date)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.hr_attendance_sessions s
      LEFT JOIN public.hr_attendance_punches op ON op.id = s.out_punch_id
     WHERE s.employee_id = p_employee_id
       AND s.attendance_date = p_date
       AND (
         COALESCE((s.flags->>'auto_paired_by_watchdog')::boolean, false)
         OR op.device_name IN ('hr_long_shift_confirmed', 'hr_shift_end_resolution')
       )
  );
$$;

CREATE OR REPLACE FUNCTION public.hr_v4_suppress_repaired_ot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF COALESCE(NEW.overtime_hours, 0) <> 0
     AND public.hr_v4_is_repaired_day(NEW.employee_id, NEW.attendance_date) THEN
    NEW.overtime_hours := 0;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_hr_attendance_suppress_repaired_ot ON public.hr_attendance;
CREATE TRIGGER trg_hr_attendance_suppress_repaired_ot
  BEFORE INSERT OR UPDATE ON public.hr_attendance
  FOR EACH ROW EXECUTE FUNCTION public.hr_v4_suppress_repaired_ot();

CREATE OR REPLACE FUNCTION public.hr_v4_suppress_repaired_ot_daily()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF COALESCE((NEW.flags->>'ot_minutes')::numeric, 0) <> 0
     AND public.hr_v4_is_repaired_day(NEW.employee_id, NEW.attendance_date) THEN
    NEW.flags := COALESCE(NEW.flags, '{}'::jsonb)
                 || jsonb_build_object('ot_minutes', 0, 'ot_suppressed_repaired', true);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_hr_attendance_daily_suppress_repaired_ot ON public.hr_attendance_daily;
CREATE TRIGGER trg_hr_attendance_daily_suppress_repaired_ot
  BEFORE INSERT OR UPDATE ON public.hr_attendance_daily
  FOR EACH ROW EXECUTE FUNCTION public.hr_v4_suppress_repaired_ot_daily();