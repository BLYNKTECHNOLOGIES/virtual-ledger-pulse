-- BUG-V4-02 FIX: fn_leave_balance_on_status_change uses wrong columns (quarter_start/quarter_end → year/quarter)
-- Also adds used_days tracking
CREATE OR REPLACE FUNCTION fn_leave_balance_on_status_change()
RETURNS TRIGGER AS $$
DECLARE
  v_year_start INT;
  v_quarter_start INT;
  v_year_end INT;
  v_quarter_end INT;
  v_year_boundary DATE;
  v_days_before NUMERIC;
  v_days_after NUMERIC;
  v_rows_affected INT;
BEGIN
  -- Check if leave spans a year boundary
  IF EXTRACT(YEAR FROM NEW.start_date) != EXTRACT(YEAR FROM NEW.end_date) THEN
    v_year_boundary := make_date(EXTRACT(YEAR FROM NEW.end_date)::INT, 1, 1);
    v_days_before := v_year_boundary - NEW.start_date;
    v_days_after := NEW.total_days - v_days_before;

    v_year_start := EXTRACT(YEAR FROM NEW.start_date)::INT;
    v_quarter_start := CEIL(EXTRACT(MONTH FROM NEW.start_date) / 3.0)::INT;
    v_year_end := EXTRACT(YEAR FROM NEW.end_date)::INT;
    v_quarter_end := CEIL(EXTRACT(MONTH FROM v_year_boundary) / 3.0)::INT;

    IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
      UPDATE hr_leave_allocations
      SET available_days = available_days - v_days_before,
          used_days = used_days + v_days_before,
          updated_at = now()
      WHERE employee_id = NEW.employee_id AND leave_type_id = NEW.leave_type_id
        AND year = v_year_start AND quarter = v_quarter_start;
      GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
      IF v_rows_affected = 0 THEN
        RAISE WARNING 'No leave allocation found for employee %, leave_type %, year %, quarter %',
          NEW.employee_id, NEW.leave_type_id, v_year_start, v_quarter_start;
      END IF;

      UPDATE hr_leave_allocations
      SET available_days = available_days - v_days_after,
          used_days = used_days + v_days_after,
          updated_at = now()
      WHERE employee_id = NEW.employee_id AND leave_type_id = NEW.leave_type_id
        AND year = v_year_end AND quarter = v_quarter_end;
      GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
      IF v_rows_affected = 0 THEN
        RAISE WARNING 'No leave allocation found for employee %, leave_type %, year %, quarter %',
          NEW.employee_id, NEW.leave_type_id, v_year_end, v_quarter_end;
      END IF;
    END IF;

    IF (NEW.status = 'cancelled' OR NEW.status = 'rejected') AND OLD.status = 'approved' THEN
      UPDATE hr_leave_allocations
      SET available_days = available_days + v_days_before,
          used_days = GREATEST(used_days - v_days_before, 0),
          updated_at = now()
      WHERE employee_id = NEW.employee_id AND leave_type_id = NEW.leave_type_id
        AND year = v_year_start AND quarter = v_quarter_start;

      UPDATE hr_leave_allocations
      SET available_days = available_days + v_days_after,
          used_days = GREATEST(used_days - v_days_after, 0),
          updated_at = now()
      WHERE employee_id = NEW.employee_id AND leave_type_id = NEW.leave_type_id
        AND year = v_year_end AND quarter = v_quarter_end;
    END IF;

    RETURN NEW;
  END IF;

  -- Normal same-year logic
  v_year_start := EXTRACT(YEAR FROM NEW.start_date)::INT;
  v_quarter_start := CEIL(EXTRACT(MONTH FROM NEW.start_date) / 3.0)::INT;

  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    UPDATE hr_leave_allocations
    SET available_days = available_days - NEW.total_days,
        used_days = used_days + NEW.total_days,
        updated_at = now()
    WHERE employee_id = NEW.employee_id AND leave_type_id = NEW.leave_type_id
      AND year = v_year_start AND quarter = v_quarter_start;
    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
    IF v_rows_affected = 0 THEN
      RAISE WARNING 'No leave allocation found for employee %, leave_type %, year %, quarter %',
        NEW.employee_id, NEW.leave_type_id, v_year_start, v_quarter_start;
    END IF;
  END IF;

  IF (NEW.status = 'cancelled' OR NEW.status = 'rejected') AND OLD.status = 'approved' THEN
    UPDATE hr_leave_allocations
    SET available_days = available_days + NEW.total_days,
        used_days = GREATEST(used_days - NEW.total_days, 0),
        updated_at = now()
    WHERE employee_id = NEW.employee_id AND leave_type_id = NEW.leave_type_id
      AND year = v_year_start AND quarter = v_quarter_start;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- BUG-V4-04 FIX: run_leave_accrual ON CONFLICT must include quarter
CREATE OR REPLACE FUNCTION run_leave_accrual(p_accrual_date DATE DEFAULT CURRENT_DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan RECORD;
  v_emp RECORD;
  v_accrued_count INTEGER := 0;
  v_year INTEGER := EXTRACT(YEAR FROM p_accrual_date);
  v_quarter INTEGER := EXTRACT(QUARTER FROM p_accrual_date);
  v_should_run BOOLEAN;
  v_existing INTEGER;
BEGIN
  FOR v_plan IN
    SELECT ap.*, lt.name AS leave_type_name
    FROM public.hr_leave_accrual_plans ap
    JOIN public.hr_leave_types lt ON lt.id = ap.leave_type_id
    WHERE ap.is_active = true AND ap.effective_from <= p_accrual_date
  LOOP
    v_should_run := false;
    IF v_plan.accrual_period = 'monthly' THEN
      SELECT COUNT(*) INTO v_existing
      FROM public.hr_leave_accrual_log
      WHERE accrual_plan_id = v_plan.id
        AND EXTRACT(YEAR FROM accrual_date) = v_year
        AND EXTRACT(MONTH FROM accrual_date) = EXTRACT(MONTH FROM p_accrual_date);
      v_should_run := (v_existing = 0);
    ELSIF v_plan.accrual_period = 'quarterly' THEN
      SELECT COUNT(*) INTO v_existing
      FROM public.hr_leave_accrual_log
      WHERE accrual_plan_id = v_plan.id AND year = v_year AND quarter = v_quarter;
      v_should_run := (v_existing = 0);
    ELSIF v_plan.accrual_period = 'yearly' THEN
      SELECT COUNT(*) INTO v_existing
      FROM public.hr_leave_accrual_log
      WHERE accrual_plan_id = v_plan.id AND year = v_year;
      v_should_run := (v_existing = 0);
    END IF;

    IF NOT v_should_run THEN CONTINUE; END IF;

    FOR v_emp IN
      SELECT e.id AS employee_id
      FROM public.hr_employees e
      LEFT JOIN public.hr_employee_work_info wi ON wi.employee_id = e.id
      WHERE e.is_active = true
        AND (
          v_plan.applicable_to = 'all'
          OR (v_plan.applicable_to = 'department' AND wi.department_id = v_plan.department_id)
          OR (v_plan.applicable_to = 'position' AND wi.job_position_id = v_plan.position_id)
        )
    LOOP
      INSERT INTO public.hr_leave_allocations (employee_id, leave_type_id, year, quarter, allocated_days, available_days, used_days)
      VALUES (v_emp.employee_id, v_plan.leave_type_id, v_year, v_quarter, v_plan.accrual_amount, v_plan.accrual_amount, 0)
      ON CONFLICT (employee_id, leave_type_id, year, quarter) DO UPDATE SET
        allocated_days = LEAST(hr_leave_allocations.allocated_days + v_plan.accrual_amount, COALESCE(v_plan.max_accrual, 999)),
        available_days = LEAST(hr_leave_allocations.available_days + v_plan.accrual_amount, COALESCE(v_plan.max_accrual, 999)),
        updated_at = NOW();

      INSERT INTO public.hr_leave_accrual_log (accrual_plan_id, employee_id, accrued_days, accrual_date, year, quarter)
      VALUES (v_plan.id, v_emp.employee_id, v_plan.accrual_amount, p_accrual_date, v_year, v_quarter);

      v_accrued_count := v_accrued_count + 1;
    END LOOP;

    UPDATE public.hr_leave_accrual_plans SET last_accrual_date = p_accrual_date, updated_at = NOW() WHERE id = v_plan.id;
  END LOOP;

  RETURN v_accrued_count;
END;
$$;

-- BUG-V4-03 FIX: Clean dead statuses and UUID::TEXT cast in standalone compute_leave_clashes
CREATE OR REPLACE FUNCTION compute_leave_clashes(p_request_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_id UUID;
  v_dept_id UUID;
  v_start DATE;
  v_end DATE;
  v_clash_count INTEGER;
BEGIN
  SELECT employee_id, start_date, end_date
  INTO v_employee_id, v_start, v_end
  FROM public.hr_leave_requests WHERE id = p_request_id;

  IF v_employee_id IS NULL THEN RETURN 0; END IF;

  SELECT department_id INTO v_dept_id
  FROM public.hr_employee_work_info
  WHERE employee_id = v_employee_id
  LIMIT 1;

  IF v_dept_id IS NULL THEN RETURN 0; END IF;

  SELECT COUNT(DISTINCT lr.employee_id)
  INTO v_clash_count
  FROM public.hr_leave_requests lr
  JOIN public.hr_employee_work_info wi ON wi.employee_id = lr.employee_id
  WHERE wi.department_id = v_dept_id
    AND lr.id != p_request_id
    AND lr.employee_id != v_employee_id
    AND lr.status IN ('requested', 'approved')
    AND lr.start_date <= v_end
    AND lr.end_date >= v_start;

  RETURN v_clash_count;
END;
$$;