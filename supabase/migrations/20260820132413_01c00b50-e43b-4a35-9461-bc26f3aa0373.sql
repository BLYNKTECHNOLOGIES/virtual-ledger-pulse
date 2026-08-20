CREATE OR REPLACE FUNCTION public.hr_prevent_reporting_cycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  cur uuid;
  hops int := 0;
BEGIN
  IF NEW.reporting_manager_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.reporting_manager_id = NEW.employee_id THEN
    RAISE EXCEPTION 'An employee cannot report to themselves';
  END IF;

  cur := NEW.reporting_manager_id;
  WHILE cur IS NOT NULL AND hops < 100 LOOP
    IF cur = NEW.employee_id THEN
      RAISE EXCEPTION 'Circular reporting line detected: this manager already reports (directly or indirectly) to this employee';
    END IF;
    SELECT w.reporting_manager_id INTO cur
      FROM public.hr_employee_work_info w
     WHERE w.employee_id = cur
     LIMIT 1;
    hops := hops + 1;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_prevent_reporting_cycle ON public.hr_employee_work_info;
CREATE TRIGGER trg_hr_prevent_reporting_cycle
BEFORE INSERT OR UPDATE OF reporting_manager_id ON public.hr_employee_work_info
FOR EACH ROW EXECUTE FUNCTION public.hr_prevent_reporting_cycle();