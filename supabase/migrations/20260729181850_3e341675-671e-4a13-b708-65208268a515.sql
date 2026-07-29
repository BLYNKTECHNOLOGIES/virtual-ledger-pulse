
CREATE OR REPLACE FUNCTION public.fn_block_sick_leave_request_on_probation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_code text;
BEGIN
  IF NEW.status IN ('approved','requested','pending')
     AND COALESCE((SELECT block_sick_leave FROM public.hr_probation_policy WHERE id), true) THEN
    SELECT code INTO v_code FROM public.hr_leave_types WHERE id = NEW.leave_type_id;
    IF v_code = 'SL' AND public.hr_is_on_probation(NEW.employee_id, NEW.start_date) THEN
      RAISE EXCEPTION 'Sick Leave is not available during probation (probation ends %). Apply Casual Leave or Loss of Pay instead.',
        public.hr_probation_end_date(NEW.employee_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_sick_leave_request_on_probation ON public.hr_leave_requests;
CREATE TRIGGER trg_block_sick_leave_request_on_probation
BEFORE INSERT OR UPDATE ON public.hr_leave_requests
FOR EACH ROW EXECUTE FUNCTION public.fn_block_sick_leave_request_on_probation();
