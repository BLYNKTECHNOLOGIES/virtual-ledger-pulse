-- BUG #1: Drop annual unique constraint (keep quarterly model)
ALTER TABLE hr_leave_allocations DROP CONSTRAINT IF EXISTS uq_leave_alloc_emp_type_year;

-- BUG #1b: Update leave balance validation trigger to filter by quarter
CREATE OR REPLACE FUNCTION fn_validate_leave_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_available numeric;
  v_leave_code text;
  v_quarter int;
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    SELECT code INTO v_leave_code FROM hr_leave_types WHERE id = NEW.leave_type_id;
    IF v_leave_code = 'LOP' THEN
      RETURN NEW;
    END IF;

    v_quarter := CEIL(EXTRACT(MONTH FROM NEW.start_date) / 3.0)::int;

    SELECT available_days INTO v_available
    FROM hr_leave_allocations
    WHERE employee_id = NEW.employee_id
      AND leave_type_id = NEW.leave_type_id
      AND year = EXTRACT(YEAR FROM NEW.start_date)::int
      AND quarter = v_quarter;

    IF v_available IS NULL THEN
      RAISE EXCEPTION 'No leave allocation found for this employee and leave type for year % quarter %', EXTRACT(YEAR FROM NEW.start_date)::int, v_quarter;
    END IF;

    IF v_available < NEW.total_days THEN
      RAISE EXCEPTION 'Insufficient leave balance. Available: %, Requested: %', v_available, NEW.total_days;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- BUG #1c: Update leave balance deduction trigger to filter by quarter
CREATE OR REPLACE FUNCTION fn_leave_balance_on_status_change()
RETURNS TRIGGER AS $$
DECLARE
  v_leave_code text;
  v_quarter int;
BEGIN
  SELECT code INTO v_leave_code FROM hr_leave_types WHERE id = NEW.leave_type_id;
  IF v_leave_code = 'LOP' THEN
    RETURN NEW;
  END IF;

  v_quarter := CEIL(EXTRACT(MONTH FROM NEW.start_date) / 3.0)::int;

  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    UPDATE hr_leave_allocations
    SET used_days = used_days + NEW.total_days,
        available_days = available_days - NEW.total_days,
        updated_at = now()
    WHERE employee_id = NEW.employee_id
      AND leave_type_id = NEW.leave_type_id
      AND year = EXTRACT(YEAR FROM NEW.start_date)::int
      AND quarter = v_quarter;
  ELSIF NEW.status = 'cancelled' AND OLD.status = 'approved' THEN
    UPDATE hr_leave_allocations
    SET used_days = GREATEST(used_days - NEW.total_days, 0),
        available_days = available_days + NEW.total_days,
        updated_at = now()
    WHERE employee_id = NEW.employee_id
      AND leave_type_id = NEW.leave_type_id
      AND year = EXTRACT(YEAR FROM NEW.start_date)::int
      AND quarter = v_quarter;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- BUG #4: Remove ::TEXT casts in compute_leave_clashes (both employee_id columns are UUID)
CREATE OR REPLACE FUNCTION compute_leave_clashes()
RETURNS TRIGGER AS $$
DECLARE
  v_dept_id TEXT;
  v_clash_count INTEGER;
BEGIN
  SELECT department_id INTO v_dept_id
  FROM public.hr_employee_work_info
  WHERE employee_id = NEW.employee_id
  LIMIT 1;

  IF v_dept_id IS NULL THEN
    NEW.leave_clashes_count := 0;
    RETURN NEW;
  END IF;

  SELECT COUNT(DISTINCT lr.employee_id)
  INTO v_clash_count
  FROM public.hr_leave_requests lr
  JOIN public.hr_employee_work_info wi ON wi.employee_id = lr.employee_id
  WHERE wi.department_id = v_dept_id
    AND lr.employee_id != NEW.employee_id
    AND lr.id != NEW.id
    AND lr.status IN ('approved', 'pending')
    AND lr.start_date <= NEW.end_date
    AND lr.end_date >= NEW.start_date;

  NEW.leave_clashes_count := v_clash_count;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- GAP #3: Rename bank_code_1 to ifsc_code in hr_employee_bank_details
ALTER TABLE hr_employee_bank_details RENAME COLUMN bank_code_1 TO ifsc_code;