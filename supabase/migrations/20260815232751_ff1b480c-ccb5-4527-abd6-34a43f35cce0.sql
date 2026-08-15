CREATE OR REPLACE FUNCTION public.hr_enforce_manual_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.manual_status IS NOT NULL THEN
    NEW.status := NEW.manual_status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_enforce_manual_status ON public.hr_attendance_daily;
CREATE TRIGGER trg_hr_enforce_manual_status
BEFORE INSERT OR UPDATE ON public.hr_attendance_daily
FOR EACH ROW EXECUTE FUNCTION public.hr_enforce_manual_status();