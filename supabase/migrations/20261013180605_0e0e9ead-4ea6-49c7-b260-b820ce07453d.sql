DROP TRIGGER IF EXISTS trg_hr_ats_hire_handoff ON public.ats_applications;
CREATE TRIGGER trg_hr_ats_hire_handoff AFTER UPDATE ON public.ats_applications
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION public.hr_ats_hire_handoff();
DROP TRIGGER IF EXISTS trg_hr_wf_resignation_withdrawn ON public.hr_employees;
CREATE TRIGGER trg_hr_wf_resignation_withdrawn AFTER UPDATE ON public.hr_employees
  FOR EACH ROW WHEN (OLD.resignation_status IS DISTINCT FROM NEW.resignation_status) EXECUTE FUNCTION public.hr_wf_resignation_withdrawn();