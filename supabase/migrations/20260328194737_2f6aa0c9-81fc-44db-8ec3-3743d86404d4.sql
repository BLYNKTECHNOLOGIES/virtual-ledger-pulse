
-- =============================================
-- P3 Migration: Logic & Features + Data Fixes
-- =============================================

-- -----------------------------------------------
-- LEAVE-01: Fix LOP configuration
-- -----------------------------------------------
UPDATE hr_leave_types SET max_days_per_year = 0, carry_forward = false WHERE code = 'LOP';

-- -----------------------------------------------
-- LEAVE-02: Fix CO compensatory flag
-- -----------------------------------------------
UPDATE hr_leave_types SET is_compensatory_leave = true WHERE code = 'CO';

-- -----------------------------------------------
-- FEAT-05: Add salary_template_id to hr_employees
-- -----------------------------------------------
ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS salary_template_id UUID REFERENCES hr_salary_structure_templates(id);

-- -----------------------------------------------
-- FEAT-05: Salary template → structure sync function
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_salary_template(p_employee_id UUID, p_template_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total_salary NUMERIC;
  v_basic_salary NUMERIC;
  v_item RECORD;
  v_amount NUMERIC;
  v_is_pct BOOLEAN;
BEGIN
  -- Get employee total salary
  SELECT total_salary INTO v_total_salary
  FROM hr_employees WHERE id = p_employee_id;

  IF v_total_salary IS NULL OR v_total_salary <= 0 THEN
    RAISE EXCEPTION 'Employee % has no valid total_salary set', p_employee_id;
  END IF;

  v_basic_salary := v_total_salary * 0.5;

  -- Delete existing structures for this employee
  DELETE FROM hr_employee_salary_structures WHERE employee_id = p_employee_id;

  -- Insert new structures from template items
  FOR v_item IN
    SELECT ti.component_id, ti.calculation_type, ti.value, ti.percentage_of, ti.formula
    FROM hr_salary_structure_template_items ti
    WHERE ti.template_id = p_template_id
  LOOP
    v_is_pct := false;
    
    IF v_item.calculation_type = 'percentage' THEN
      v_is_pct := true;
      -- Calculate actual amount based on percentage_of
      IF v_item.percentage_of = 'basic' THEN
        v_amount := v_basic_salary * (v_item.value / 100.0);
      ELSIF v_item.percentage_of = 'gross' OR v_item.percentage_of = 'total' THEN
        v_amount := v_total_salary * (v_item.value / 100.0);
      ELSE
        v_amount := v_basic_salary * (v_item.value / 100.0);
      END IF;
    ELSIF v_item.calculation_type = 'fixed' THEN
      v_amount := v_item.value;
    ELSE
      -- formula or other: store value as-is
      v_amount := COALESCE(v_item.value, 0);
    END IF;

    INSERT INTO hr_employee_salary_structures (employee_id, component_id, amount, is_percentage, is_active)
    VALUES (p_employee_id, v_item.component_id, v_amount, v_is_pct, true);
  END LOOP;

  -- Update employee record
  UPDATE hr_employees
  SET basic_salary = v_basic_salary,
      salary_template_id = p_template_id,
      updated_at = now()
  WHERE id = p_employee_id;
END;
$function$;

-- -----------------------------------------------
-- FEAT-04: Monthly penalty auto-calculation
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_calculate_monthly_penalties(p_year INT, p_month INT)
RETURNS TABLE(employee_id UUID, late_count BIGINT, rule_name TEXT, penalty_type TEXT, penalty_value NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_month_str TEXT;
  v_rec RECORD;
  v_rule RECORD;
BEGIN
  v_month_str := p_year || '-' || LPAD(p_month::TEXT, 2, '0');

  FOR v_rec IN
    SELECT lc.employee_id, COUNT(*) as cnt
    FROM hr_late_come_early_out lc
    WHERE lc.type = 'late_come'
      AND EXTRACT(YEAR FROM lc.attendance_date) = p_year
      AND EXTRACT(MONTH FROM lc.attendance_date) = p_month
    GROUP BY lc.employee_id
  LOOP
    -- Find matching penalty rule
    SELECT pr.* INTO v_rule
    FROM hr_penalty_rules pr
    WHERE pr.is_active = true
      AND v_rec.cnt >= pr.late_count_min
      AND (pr.late_count_max IS NULL OR v_rec.cnt <= pr.late_count_max)
    ORDER BY pr.late_count_min DESC
    LIMIT 1;

    IF v_rule IS NOT NULL THEN
      -- Check if penalty already exists for this month
      IF NOT EXISTS (
        SELECT 1 FROM hr_penalties p
        WHERE p.employee_id = v_rec.employee_id
          AND p.penalty_month = v_month_str
          AND p.rule_id = v_rule.id
      ) THEN
        INSERT INTO hr_penalties (
          employee_id, penalty_month, penalty_type, penalty_reason,
          penalty_amount, penalty_days, late_count, rule_id,
          is_applied, created_by, notes
        ) VALUES (
          v_rec.employee_id, v_month_str, v_rule.penalty_type,
          'Auto-calculated: ' || v_rec.cnt || ' late marks in ' || v_month_str,
          v_rule.penalty_value,
          CASE WHEN v_rule.penalty_type = 'lop_deduction' THEN v_rule.penalty_value ELSE 0 END,
          v_rec.cnt::INT, v_rule.id,
          false, 'system',
          'Auto-generated by fn_calculate_monthly_penalties'
        );
      END IF;

      employee_id := v_rec.employee_id;
      late_count := v_rec.cnt;
      rule_name := v_rule.rule_name;
      penalty_type := v_rule.penalty_type;
      penalty_value := v_rule.penalty_value;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$function$;

-- -----------------------------------------------
-- GAP-05: Salary revision type from session variable
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_salary_revision_on_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_revision_type TEXT;
BEGIN
  IF (OLD.basic_salary IS DISTINCT FROM NEW.basic_salary) OR (OLD.total_salary IS DISTINCT FROM NEW.total_salary) THEN
    -- Use session variable if set by application, otherwise default to 'correction'
    v_revision_type := COALESCE(NULLIF(current_setting('app.revision_type', true), ''), 'correction');
    
    INSERT INTO hr_salary_revisions (employee_id, previous_basic, new_basic, previous_total, new_total, revision_type)
    VALUES (NEW.id, OLD.basic_salary, NEW.basic_salary, OLD.total_salary, NEW.total_salary, v_revision_type);
  END IF;
  RETURN NEW;
END;
$function$;

-- -----------------------------------------------
-- PAYROLL-01: Payroll status state machine
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_payroll_status_state_machine()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Skip if status not changing
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Allow cancellation from any state except completed
  IF NEW.status = 'cancelled' THEN
    IF OLD.status = 'completed' THEN
      RAISE EXCEPTION 'Cannot cancel a completed payroll run';
    END IF;
    RETURN NEW;
  END IF;

  -- Enforce forward-only transitions
  CASE OLD.status
    WHEN 'draft' THEN
      IF NEW.status != 'processing' THEN
        RAISE EXCEPTION 'Payroll run can only move from draft to processing, not to %', NEW.status;
      END IF;
    WHEN 'processing' THEN
      IF NEW.status != 'generated' THEN
        RAISE EXCEPTION 'Payroll run can only move from processing to generated, not to %', NEW.status;
      END IF;
    WHEN 'generated' THEN
      IF NEW.status != 'reviewed' THEN
        RAISE EXCEPTION 'Payroll run can only move from generated to reviewed, not to %', NEW.status;
      END IF;
    WHEN 'reviewed' THEN
      IF NEW.status != 'completed' THEN
        RAISE EXCEPTION 'Payroll run can only move from reviewed to completed, not to %', NEW.status;
      END IF;
    WHEN 'completed' THEN
      RAISE EXCEPTION 'Cannot change status of a completed payroll run';
    WHEN 'cancelled' THEN
      RAISE EXCEPTION 'Cannot change status of a cancelled payroll run';
    ELSE
      RAISE EXCEPTION 'Unknown payroll run status: %', OLD.status;
  END CASE;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_payroll_status_state_machine ON hr_payroll_runs;
CREATE TRIGGER trg_payroll_status_state_machine
  BEFORE UPDATE OF status ON hr_payroll_runs
  FOR EACH ROW EXECUTE FUNCTION fn_payroll_status_state_machine();

-- -----------------------------------------------
-- PAYROLL-03: Working days calculation function
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_calculate_working_days(p_employee_id UUID, p_start DATE, p_end DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_calendar_days INTEGER;
  v_holidays INTEGER;
  v_weekly_offs INTEGER;
  v_pattern RECORD;
  v_day DATE;
  v_dow INTEGER;
BEGIN
  -- Total calendar days (inclusive)
  v_calendar_days := (p_end - p_start) + 1;

  -- Count holidays in range
  SELECT COUNT(*) INTO v_holidays
  FROM hr_holidays
  WHERE date BETWEEN p_start AND p_end
    AND is_active = true;

  -- Get employee's current weekly off pattern
  v_weekly_offs := 0;
  SELECT wop.weekly_offs, wop.is_alternating, wop.alternate_week_offs
  INTO v_pattern
  FROM hr_employee_weekly_off ewo
  JOIN hr_weekly_off_patterns wop ON wop.id = ewo.pattern_id
  WHERE ewo.employee_id = p_employee_id
    AND ewo.is_current = true
  LIMIT 1;

  IF v_pattern IS NOT NULL THEN
    -- Count weekly off days in the range
    v_day := p_start;
    WHILE v_day <= p_end LOOP
      v_dow := EXTRACT(DOW FROM v_day)::INTEGER; -- 0=Sun, 6=Sat
      IF v_dow = ANY(v_pattern.weekly_offs::INT[]) THEN
        -- Check it's not already counted as holiday
        IF NOT EXISTS (SELECT 1 FROM hr_holidays WHERE date = v_day AND is_active = true) THEN
          v_weekly_offs := v_weekly_offs + 1;
        END IF;
      END IF;
      v_day := v_day + 1;
    END LOOP;
  END IF;

  RETURN GREATEST(v_calendar_days - v_holidays - v_weekly_offs, 0);
END;
$function$;
