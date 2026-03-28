
-- P0+P1 Bug Fixes Migration

-- BUG-01: Deduplicate then add UNIQUE constraint
DELETE FROM hr_attendance_daily a
USING hr_attendance_daily b
WHERE a.employee_id = b.employee_id
  AND a.attendance_date = b.attendance_date
  AND a.id < b.id;

ALTER TABLE hr_attendance_daily
  ADD CONSTRAINT uq_attendance_daily_employee_date UNIQUE (employee_id, attendance_date);

-- BUG-02: Set is_night_shift = true for Night Shift
UPDATE hr_shifts SET is_night_shift = true
WHERE name ILIKE '%night%' AND is_night_shift = false;

-- BUG-03: Fix fn_leave_balance_on_status_change to reverse balance on 'rejected' too
CREATE OR REPLACE FUNCTION fn_leave_balance_on_status_change()
RETURNS TRIGGER AS $$
DECLARE
  v_quarter_start DATE;
  v_quarter_end DATE;
BEGIN
  v_quarter_start := date_trunc('quarter', NEW.start_date)::DATE;
  v_quarter_end := (date_trunc('quarter', NEW.start_date) + INTERVAL '3 months' - INTERVAL '1 day')::DATE;

  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    UPDATE hr_leave_allocations
    SET available_days = available_days - NEW.total_days,
        updated_at = now()
    WHERE employee_id = NEW.employee_id
      AND leave_type_id = NEW.leave_type_id
      AND quarter_start = v_quarter_start
      AND quarter_end = v_quarter_end;
  END IF;

  IF (NEW.status = 'cancelled' OR NEW.status = 'rejected') AND OLD.status = 'approved' THEN
    UPDATE hr_leave_allocations
    SET available_days = available_days + NEW.total_days,
        updated_at = now()
    WHERE employee_id = NEW.employee_id
      AND leave_type_id = NEW.leave_type_id
      AND quarter_start = v_quarter_start
      AND quarter_end = v_quarter_end;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- BUG-05: Add is_percentage column
ALTER TABLE hr_employee_salary_structures
  ADD COLUMN IF NOT EXISTS is_percentage BOOLEAN NOT NULL DEFAULT true;

-- BUG-06: Delete ESIC rows for employees earning > 21000 (using component_id)
DELETE FROM hr_employee_salary_structures ss
USING hr_employees e
WHERE ss.employee_id = e.id
  AND ss.component_id IN ('86c57d1b-1ccf-4c76-b58e-25e59fc40772', 'a5cb61bf-a699-4893-aadf-44c5fab6b492')
  AND e.total_salary > 21000;

-- BUG-07: Populate basic_salary
UPDATE hr_employees
SET basic_salary = total_salary * 0.5,
    updated_at = now()
WHERE basic_salary IS NULL
  AND total_salary > 0;

-- GAP-02: Drop empty hr_employee_salary table
DROP TABLE IF EXISTS hr_employee_salary;
