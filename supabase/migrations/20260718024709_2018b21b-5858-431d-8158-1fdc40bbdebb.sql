
CREATE OR REPLACE FUNCTION public.hr_credit_leave_allocation_on_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _year int;
  _quarter int;
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    _year := EXTRACT(YEAR FROM COALESCE(NEW.approved_at, now()))::int;
    _quarter := EXTRACT(QUARTER FROM COALESCE(NEW.approved_at, now()))::int;

    INSERT INTO public.hr_leave_allocations
      (employee_id, leave_type_id, year, quarter, allocated_days, used_days, carry_forward_days)
    VALUES
      (NEW.employee_id, NEW.leave_type_id, _year, _quarter, NEW.requested_days, 0, 0)
    ON CONFLICT (employee_id, leave_type_id, year, quarter)
    DO UPDATE SET allocated_days = public.hr_leave_allocations.allocated_days + EXCLUDED.allocated_days,
                  updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

-- Ensure conflict target exists (needed for ON CONFLICT above).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public'
      AND indexname='hr_leave_allocations_emp_type_yr_q_uniq'
  ) THEN
    CREATE UNIQUE INDEX hr_leave_allocations_emp_type_yr_q_uniq
      ON public.hr_leave_allocations (employee_id, leave_type_id, year, quarter);
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_hr_credit_leave_allocation_on_approval
  ON public.hr_leave_allocation_requests;

CREATE TRIGGER trg_hr_credit_leave_allocation_on_approval
AFTER UPDATE ON public.hr_leave_allocation_requests
FOR EACH ROW
EXECUTE FUNCTION public.hr_credit_leave_allocation_on_approval();
