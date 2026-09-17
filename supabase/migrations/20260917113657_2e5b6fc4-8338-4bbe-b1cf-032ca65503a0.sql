UPDATE public.hr_employees
SET first_name = btrim(regexp_replace(first_name, '\s+', ' ', 'g')),
    last_name  = btrim(regexp_replace(coalesce(last_name,''), '\s+', ' ', 'g'))
WHERE coalesce(first_name,'') ~ '(^\s|\s$|\s\s)' OR coalesce(last_name,'') ~ '(^\s|\s$|\s\s)';

CREATE OR REPLACE FUNCTION public.hr_normalize_employee_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.first_name IS NOT NULL THEN
    NEW.first_name := btrim(regexp_replace(NEW.first_name, '\s+', ' ', 'g'));
  END IF;
  IF NEW.last_name IS NOT NULL THEN
    NEW.last_name := btrim(regexp_replace(NEW.last_name, '\s+', ' ', 'g'));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_normalize_employee_name ON public.hr_employees;
CREATE TRIGGER trg_hr_normalize_employee_name
BEFORE INSERT OR UPDATE OF first_name, last_name ON public.hr_employees
FOR EACH ROW EXECUTE FUNCTION public.hr_normalize_employee_name();