CREATE OR REPLACE FUNCTION public.hr_tg_resignation_complete_requires_fnf()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.resignation_status = 'completed'
     AND (TG_OP = 'INSERT' OR OLD.resignation_status IS DISTINCT FROM 'completed')
     AND NOT EXISTS (SELECT 1 FROM public.hr_fnf_settlements f WHERE f.employee_id = NEW.id AND f.status = 'paid') THEN
    -- Keep access-closing (is_active=false) but the separation stays open until F&F is paid.
    NEW.resignation_status := COALESCE(NULLIF(OLD.resignation_status, 'completed'), 'notice_period');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_resignation_complete_requires_fnf ON public.hr_employees;
CREATE TRIGGER trg_resignation_complete_requires_fnf BEFORE INSERT OR UPDATE OF resignation_status ON public.hr_employees
FOR EACH ROW EXECUTE FUNCTION public.hr_tg_resignation_complete_requires_fnf();

CREATE OR REPLACE FUNCTION public.hr_tg_fnf_paid_completes_resignation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid' THEN
    UPDATE public.hr_employees SET resignation_status = 'completed'
     WHERE id = NEW.employee_id AND resignation_status = 'notice_period'
       AND last_working_day IS NOT NULL AND last_working_day <= (now() AT TIME ZONE 'Asia/Kolkata')::date;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_fnf_paid_completes_resignation ON public.hr_fnf_settlements;
CREATE TRIGGER trg_fnf_paid_completes_resignation AFTER UPDATE OF status ON public.hr_fnf_settlements
FOR EACH ROW EXECUTE FUNCTION public.hr_tg_fnf_paid_completes_resignation();

REVOKE ALL ON FUNCTION public.hr_tg_resignation_complete_requires_fnf() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hr_tg_fnf_paid_completes_resignation() FROM PUBLIC, anon, authenticated;

UPDATE public.hr_employees e SET resignation_status = 'notice_period'
 WHERE resignation_status = 'completed'
   AND NOT EXISTS (SELECT 1 FROM public.hr_fnf_settlements f WHERE f.employee_id = e.id AND f.status = 'paid');