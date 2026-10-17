CREATE OR REPLACE FUNCTION public.hr_employees_block_delete_without_separation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(OLD.resignation_status,'') <> 'completed'
     OR OLD.last_working_day IS NULL
     OR OLD.last_working_day >= (now() AT TIME ZONE 'Asia/Kolkata')::date
     OR NOT EXISTS (SELECT 1 FROM public.hr_fnf_settlements f WHERE f.employee_id = OLD.id AND f.status = 'paid') THEN
    RAISE EXCEPTION 'SEPARATION_REQUIRED: % cannot be deleted until the separation flow is complete (resignation completed, last working day passed, F&F paid).', OLD.badge_id
      USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS hr_employees_block_delete_without_separation ON public.hr_employees;
CREATE TRIGGER hr_employees_block_delete_without_separation
BEFORE DELETE ON public.hr_employees FOR EACH ROW
EXECUTE FUNCTION public.hr_employees_block_delete_without_separation();