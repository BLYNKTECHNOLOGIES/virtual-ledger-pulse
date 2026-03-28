
-- Fix compute_leave_clashes: remove dead 'pending' status
CREATE OR REPLACE FUNCTION public.compute_leave_clashes()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
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
    AND lr.status IN ('approved', 'requested')
    AND lr.start_date <= NEW.end_date
    AND lr.end_date >= NEW.start_date;

  NEW.leave_clashes_count := v_clash_count;
  RETURN NEW;
END;
$function$;

-- GAP-03: Make TEXT hour columns generated from integer seconds
-- Drop old TEXT columns and recreate as generated
ALTER TABLE hr_hour_accounts DROP COLUMN IF EXISTS worked_hours;
ALTER TABLE hr_hour_accounts DROP COLUMN IF EXISTS pending_hours;
ALTER TABLE hr_hour_accounts DROP COLUMN IF EXISTS overtime;

ALTER TABLE hr_hour_accounts ADD COLUMN worked_hours TEXT GENERATED ALWAYS AS (
  LPAD((hour_account_second / 3600)::TEXT, 2, '0') || ':' || LPAD(((hour_account_second % 3600) / 60)::TEXT, 2, '0')
) STORED;

ALTER TABLE hr_hour_accounts ADD COLUMN pending_hours TEXT GENERATED ALWAYS AS (
  LPAD((hour_pending_second / 3600)::TEXT, 2, '0') || ':' || LPAD(((hour_pending_second % 3600) / 60)::TEXT, 2, '0')
) STORED;

ALTER TABLE hr_hour_accounts ADD COLUMN overtime TEXT GENERATED ALWAYS AS (
  LPAD((overtime_second / 3600)::TEXT, 2, '0') || ':' || LPAD(((overtime_second % 3600) / 60)::TEXT, 2, '0')
) STORED;

-- LEAVE-03: Cross-year leave spanning — split deduction across year allocations
CREATE OR REPLACE FUNCTION public.fn_leave_balance_on_status_change()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_quarter_start DATE;
  v_quarter_end DATE;
  v_year_boundary DATE;
  v_days_before NUMERIC;
  v_days_after NUMERIC;
  v_q2_start DATE;
  v_q2_end DATE;
BEGIN
  -- Check if leave spans a year boundary
  IF EXTRACT(YEAR FROM NEW.start_date) != EXTRACT(YEAR FROM NEW.end_date) THEN
    -- Split at year boundary
    v_year_boundary := make_date(EXTRACT(YEAR FROM NEW.end_date)::INT, 1, 1);
    v_days_before := v_year_boundary - NEW.start_date; -- days in old year
    v_days_after := NEW.total_days - v_days_before;     -- days in new year

    -- Deduct/restore for old year quarter
    v_quarter_start := date_trunc('quarter', NEW.start_date)::DATE;
    v_quarter_end := (date_trunc('quarter', NEW.start_date) + INTERVAL '3 months' - INTERVAL '1 day')::DATE;

    -- Deduct/restore for new year quarter (Q1 of next year)
    v_q2_start := date_trunc('quarter', v_year_boundary)::DATE;
    v_q2_end := (date_trunc('quarter', v_year_boundary) + INTERVAL '3 months' - INTERVAL '1 day')::DATE;

    IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
      UPDATE hr_leave_allocations
      SET available_days = available_days - v_days_before, updated_at = now()
      WHERE employee_id = NEW.employee_id AND leave_type_id = NEW.leave_type_id
        AND quarter_start = v_quarter_start AND quarter_end = v_quarter_end;

      UPDATE hr_leave_allocations
      SET available_days = available_days - v_days_after, updated_at = now()
      WHERE employee_id = NEW.employee_id AND leave_type_id = NEW.leave_type_id
        AND quarter_start = v_q2_start AND quarter_end = v_q2_end;
    END IF;

    IF (NEW.status = 'cancelled' OR NEW.status = 'rejected') AND OLD.status = 'approved' THEN
      UPDATE hr_leave_allocations
      SET available_days = available_days + v_days_before, updated_at = now()
      WHERE employee_id = NEW.employee_id AND leave_type_id = NEW.leave_type_id
        AND quarter_start = v_quarter_start AND quarter_end = v_quarter_end;

      UPDATE hr_leave_allocations
      SET available_days = available_days + v_days_after, updated_at = now()
      WHERE employee_id = NEW.employee_id AND leave_type_id = NEW.leave_type_id
        AND quarter_start = v_q2_start AND quarter_end = v_q2_end;
    END IF;

    RETURN NEW;
  END IF;

  -- Normal same-year logic
  v_quarter_start := date_trunc('quarter', NEW.start_date)::DATE;
  v_quarter_end := (date_trunc('quarter', NEW.start_date) + INTERVAL '3 months' - INTERVAL '1 day')::DATE;

  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    UPDATE hr_leave_allocations
    SET available_days = available_days - NEW.total_days, updated_at = now()
    WHERE employee_id = NEW.employee_id AND leave_type_id = NEW.leave_type_id
      AND quarter_start = v_quarter_start AND quarter_end = v_quarter_end;
  END IF;

  IF (NEW.status = 'cancelled' OR NEW.status = 'rejected') AND OLD.status = 'approved' THEN
    UPDATE hr_leave_allocations
    SET available_days = available_days + NEW.total_days, updated_at = now()
    WHERE employee_id = NEW.employee_id AND leave_type_id = NEW.leave_type_id
      AND quarter_start = v_quarter_start AND quarter_end = v_quarter_end;
  END IF;

  RETURN NEW;
END;
$function$;

-- LEAVE-04: Minimum notice period — prevent backdating beyond 3 days
CREATE OR REPLACE FUNCTION public.validate_leave_request_dates()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.end_date < NEW.start_date THEN
    RAISE EXCEPTION 'Leave end_date (%) cannot be before start_date (%)', NEW.end_date, NEW.start_date;
  END IF;
  IF NEW.total_days IS NOT NULL AND NEW.total_days <= 0 THEN
    RAISE EXCEPTION 'Leave total_days must be greater than 0, got %', NEW.total_days;
  END IF;
  -- LEAVE-04: Prevent backdating beyond 3 days
  IF NEW.start_date < (CURRENT_DATE - INTERVAL '3 days')::DATE THEN
    RAISE EXCEPTION 'Leave start_date (%) cannot be more than 3 days in the past', NEW.start_date;
  END IF;
  RETURN NEW;
END;
$function$;
