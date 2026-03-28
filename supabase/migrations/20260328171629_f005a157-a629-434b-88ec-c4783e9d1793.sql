
-- 1. Add tds_amount column to hr_payslips if not exists
ALTER TABLE public.hr_payslips ADD COLUMN IF NOT EXISTS tds_amount NUMERIC DEFAULT 0;

-- 2. Add leave_clashes_count column to hr_leave_requests if not exists
ALTER TABLE public.hr_leave_requests ADD COLUMN IF NOT EXISTS leave_clashes_count INTEGER DEFAULT 0;

-- 3. Trigger function: validate leave balance before approval
CREATE OR REPLACE FUNCTION public.validate_leave_balance_on_approve()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_total_allocated NUMERIC;
  v_total_used NUMERIC;
  v_available NUMERIC;
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    SELECT
      COALESCE(SUM(allocated_days), 0),
      COALESCE(SUM(used_days), 0)
    INTO v_total_allocated, v_total_used
    FROM public.hr_leave_allocations
    WHERE employee_id = NEW.employee_id
      AND leave_type_id = NEW.leave_type_id;

    v_available := v_total_allocated - v_total_used;

    IF NEW.total_days > v_available THEN
      RAISE EXCEPTION 'Insufficient leave balance. Available: % days, Requested: % days',
        v_available, NEW.total_days;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_leave_balance ON public.hr_leave_requests;
CREATE TRIGGER trg_validate_leave_balance
  BEFORE UPDATE ON public.hr_leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_leave_balance_on_approve();

-- 4. Function to compute leave clashes (same department, overlapping dates)
CREATE OR REPLACE FUNCTION public.compute_leave_clashes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_dept_id TEXT;
  v_clash_count INTEGER;
BEGIN
  SELECT department_id INTO v_dept_id
  FROM public.hr_employee_work_info
  WHERE employee_id = NEW.employee_id::TEXT
  LIMIT 1;

  IF v_dept_id IS NULL THEN
    NEW.leave_clashes_count := 0;
    RETURN NEW;
  END IF;

  SELECT COUNT(DISTINCT lr.employee_id)
  INTO v_clash_count
  FROM public.hr_leave_requests lr
  JOIN public.hr_employee_work_info wi ON wi.employee_id = lr.employee_id::TEXT
  WHERE wi.department_id = v_dept_id
    AND lr.employee_id != NEW.employee_id
    AND lr.id != NEW.id
    AND lr.status IN ('approved', 'pending')
    AND lr.start_date <= NEW.end_date
    AND lr.end_date >= NEW.start_date;

  NEW.leave_clashes_count := v_clash_count;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compute_leave_clashes ON public.hr_leave_requests;
CREATE TRIGGER trg_compute_leave_clashes
  BEFORE INSERT OR UPDATE ON public.hr_leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.compute_leave_clashes();

-- 5. Partial unique index to prevent duplicate leave requests
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_leave_request
  ON public.hr_leave_requests (employee_id, leave_type_id, start_date, end_date)
  WHERE status NOT IN ('rejected', 'cancelled');
