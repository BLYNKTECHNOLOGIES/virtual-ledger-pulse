CREATE OR REPLACE FUNCTION public.hr_leave_requests_require_type()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.leave_type_id IS NULL THEN
    RAISE EXCEPTION 'A leave type must be selected before submitting a leave request.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leave_requests_require_type ON public.hr_leave_requests;
CREATE TRIGGER trg_leave_requests_require_type
BEFORE INSERT ON public.hr_leave_requests
FOR EACH ROW EXECUTE FUNCTION public.hr_leave_requests_require_type();