
-- ============================================================
-- HRMS V5 Round 2 — 4 Fixes
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. COMPLIANCE-V5-01: Fix ESI base (basic_pay → total_salary) and employer rate (3.75 → 3.25)
-- Only UNDER 21000 template has ESI components
-- ────────────────────────────────────────────────────────────
UPDATE hr_salary_structure_template_items 
SET percentage_of = 'total_salary'
WHERE id IN ('4bedce84-2dfa-4c3a-ad83-908ce182aba3', 'f63b3419-aae5-4fb1-9e68-0beb5dfbed27');

UPDATE hr_salary_structure_template_items
SET value = 3.25
WHERE id = '4bedce84-2dfa-4c3a-ad83-908ce182aba3';

-- ────────────────────────────────────────────────────────────
-- 2. GAP-V5-04: CompOff → leave allocation bridge
-- When a CompOff credit is inserted with is_allocated=false,
-- auto-create/update leave allocation for the CO leave type
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_allocate_compoff_credit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_co_leave_type_id UUID;
  v_year INT;
  v_quarter INT;
  v_alloc_id UUID;
BEGIN
  -- Only process on INSERT or when is_allocated changes to false→we need to allocate
  IF NEW.is_allocated = true THEN
    RETURN NEW;
  END IF;

  -- Get the Compensatory Off leave type
  SELECT id INTO v_co_leave_type_id 
  FROM hr_leave_types 
  WHERE code = 'CO' AND is_active = true
  LIMIT 1;

  IF v_co_leave_type_id IS NULL THEN
    RAISE WARNING 'Compensatory Off leave type not found or inactive';
    RETURN NEW;
  END IF;

  v_year := EXTRACT(YEAR FROM NEW.credit_date)::INT;
  v_quarter := CEIL(EXTRACT(MONTH FROM NEW.credit_date) / 3.0)::INT;

  -- Upsert leave allocation: add credit_days to existing allocation
  INSERT INTO hr_leave_allocations (employee_id, leave_type_id, year, quarter, allocated_days, used_days, carry_forward_days, available_days)
  VALUES (NEW.employee_id, v_co_leave_type_id, v_year, v_quarter, NEW.credit_days, 0, 0, NEW.credit_days)
  ON CONFLICT (employee_id, leave_type_id, year, quarter)
  DO UPDATE SET
    allocated_days = hr_leave_allocations.allocated_days + NEW.credit_days,
    available_days = hr_leave_allocations.available_days + NEW.credit_days,
    updated_at = now()
  RETURNING id INTO v_alloc_id;

  -- Mark credit as allocated
  NEW.is_allocated := true;
  NEW.allocated_at := now();
  NEW.leave_allocation_id := v_alloc_id;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_allocate_compoff_credit ON hr_compoff_credits;
CREATE TRIGGER trg_allocate_compoff_credit
  BEFORE INSERT ON hr_compoff_credits
  FOR EACH ROW EXECUTE FUNCTION fn_allocate_compoff_credit();

-- ────────────────────────────────────────────────────────────
-- 3. GAP-V5-06: Server-side total_days computation
-- Enhance fn_validate_leave_balance to recalculate total_days
-- using fn_calculate_working_days for non-half-day leaves
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_validate_leave_balance()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_available numeric;
  v_leave_code text;
  v_quarter int;
  v_computed_days numeric;
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    SELECT code INTO v_leave_code FROM hr_leave_types WHERE id = NEW.leave_type_id;
    IF v_leave_code = 'LOP' THEN
      RETURN NEW;
    END IF;

    -- Server-side total_days computation for non-half-day leaves
    IF NEW.is_half_day = true THEN
      v_computed_days := 0.5;
    ELSE
      v_computed_days := fn_calculate_working_days(NEW.employee_id, NEW.start_date, NEW.end_date);
    END IF;

    -- Override frontend-provided total_days if mismatch
    IF v_computed_days > 0 AND v_computed_days <> NEW.total_days THEN
      RAISE WARNING 'Correcting total_days from % to % (server-computed)', NEW.total_days, v_computed_days;
      NEW.total_days := v_computed_days;
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
$function$;

-- ────────────────────────────────────────────────────────────
-- 4. BUG-V5-06/07: Create RPC to auto-assign + apply correct template
-- based on employee total_salary range
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_assign_and_apply_salary_template(p_employee_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total_salary NUMERIC;
  v_template_id UUID;
  v_template_name TEXT;
BEGIN
  SELECT total_salary INTO v_total_salary
  FROM hr_employees WHERE id = p_employee_id;

  IF v_total_salary IS NULL OR v_total_salary <= 0 THEN
    RETURN 'SKIP: Employee has no valid total_salary';
  END IF;

  -- Determine correct template based on salary range
  IF v_total_salary < 21000 THEN
    SELECT id, name INTO v_template_id, v_template_name 
    FROM hr_salary_structure_templates WHERE name = 'UNDER 21000';
  ELSIF v_total_salary <= 30000 THEN
    SELECT id, name INTO v_template_id, v_template_name 
    FROM hr_salary_structure_templates WHERE name = 'B/W 21000 TO 30000';
  ELSE
    SELECT id, name INTO v_template_id, v_template_name 
    FROM hr_salary_structure_templates WHERE name = 'OVER 30000';
  END IF;

  IF v_template_id IS NULL THEN
    RETURN 'SKIP: No matching template found';
  END IF;

  -- Apply the template (this deletes existing structures and creates new ones)
  PERFORM apply_salary_template(p_employee_id, v_template_id);

  RETURN format('APPLIED: %s (salary=%s)', v_template_name, v_total_salary);
END;
$function$;

-- Batch function to re-apply for all active employees with salary structures
CREATE OR REPLACE FUNCTION public.batch_reapply_salary_templates()
 RETURNS TABLE(employee_name text, result text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_emp RECORD;
BEGIN
  FOR v_emp IN
    SELECT DISTINCT e.id, e.first_name || ' ' || COALESCE(e.last_name, '') AS full_name
    FROM hr_employees e
    WHERE e.is_active = true AND e.total_salary > 0
    ORDER BY full_name
  LOOP
    employee_name := v_emp.full_name;
    result := auto_assign_and_apply_salary_template(v_emp.id);
    RETURN NEXT;
  END LOOP;
END;
$function$;
