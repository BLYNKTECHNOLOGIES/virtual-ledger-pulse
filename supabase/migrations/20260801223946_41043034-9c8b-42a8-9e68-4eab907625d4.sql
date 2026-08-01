CREATE OR REPLACE FUNCTION public.hr_block_absent_on_weekly_off()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offs int[];
  v_status text;
  v_date date;
BEGIN
  IF TG_TABLE_NAME = 'hr_attendance' THEN
    v_status := NEW.attendance_status; v_date := NEW.attendance_date;
  ELSE
    v_status := NEW.status; v_date := NEW.attendance_date;
  END IF;

  IF v_status IS DISTINCT FROM 'absent' OR v_date IS NULL OR NEW.employee_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_offs := public.fn_employee_weekly_off_dows(NEW.employee_id, v_date);
  IF v_offs IS NOT NULL AND EXTRACT(DOW FROM v_date)::int = ANY(v_offs) THEN
    IF TG_TABLE_NAME = 'hr_attendance' THEN
      RETURN NULL; -- never store an absent row on a weekly-off day
    ELSE
      NEW.status := 'no_data';
      RETURN NEW;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_attendance_block_absent_weekly_off ON public.hr_attendance;
CREATE TRIGGER trg_hr_attendance_block_absent_weekly_off
BEFORE INSERT OR UPDATE ON public.hr_attendance
FOR EACH ROW EXECUTE FUNCTION public.hr_block_absent_on_weekly_off();

DROP TRIGGER IF EXISTS trg_hr_attendance_daily_block_absent_weekly_off ON public.hr_attendance_daily;
CREATE TRIGGER trg_hr_attendance_daily_block_absent_weekly_off
BEFORE INSERT OR UPDATE ON public.hr_attendance_daily
FOR EACH ROW EXECUTE FUNCTION public.hr_block_absent_on_weekly_off();