CREATE OR REPLACE FUNCTION public.hr_block_july2026_sunday_attendance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_date date;
BEGIN
  v_date := NEW.attendance_date;
  IF v_date IS NULL THEN
    RETURN NEW;
  END IF;

  -- July 2026 is a manually reconciled month: Sundays stay empty (weekly off),
  -- regardless of what the eSSL biometric sync pushes in.
  IF v_date >= DATE '2026-07-01' AND v_date <= DATE '2026-07-31'
     AND EXTRACT(DOW FROM v_date)::int = 0 THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_hr_attendance_block_july2026_sunday ON public.hr_attendance;
CREATE TRIGGER trg_hr_attendance_block_july2026_sunday
BEFORE INSERT OR UPDATE ON public.hr_attendance
FOR EACH ROW EXECUTE FUNCTION public.hr_block_july2026_sunday_attendance();

DROP TRIGGER IF EXISTS trg_hr_attendance_daily_block_july2026_sunday ON public.hr_attendance_daily;
CREATE TRIGGER trg_hr_attendance_daily_block_july2026_sunday
BEFORE INSERT OR UPDATE ON public.hr_attendance_daily
FOR EACH ROW EXECUTE FUNCTION public.hr_block_july2026_sunday_attendance();