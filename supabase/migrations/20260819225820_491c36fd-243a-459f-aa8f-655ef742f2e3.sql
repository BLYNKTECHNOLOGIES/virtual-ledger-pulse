CREATE OR REPLACE FUNCTION public.hr_revoke_sunday_work_credit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_id uuid := COALESCE(OLD.employee_id, NEW.employee_id);
  v_attendance_date date := COALESCE(OLD.attendance_date, NEW.attendance_date);
BEGIN
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW.status NOT IN ('present', 'late', 'half_day')) THEN
    DELETE FROM public.hr_compoff_credits
    WHERE employee_id = v_employee_id
      AND credit_date = v_attendance_date
      AND credit_type IN ('sunday_work', 'holiday')
      AND notes LIKE 'Auto-granted:%';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.hr_revoke_sunday_work_credit() FROM PUBLIC, anon, authenticated;