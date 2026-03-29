
-- ============================================================
-- 1. COMPLIANCE-V5-02: EPF ₹1,800 cap enforcement
-- Modify apply_salary_template to cap EPF components at ₹1,800
-- ============================================================

CREATE OR REPLACE FUNCTION public.apply_salary_template(p_employee_id uuid, p_template_id uuid)
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
  v_vars JSONB;
  v_comp_code TEXT;
  v_formula TEXT;
  v_key TEXT;
  v_epf_statutory_cap CONSTANT NUMERIC := 1800;
BEGIN
  SELECT total_salary INTO v_total_salary
  FROM hr_employees WHERE id = p_employee_id;

  IF v_total_salary IS NULL OR v_total_salary <= 0 THEN
    RAISE EXCEPTION 'Employee % has no valid total_salary set', p_employee_id;
  END IF;

  v_basic_salary := v_total_salary * 0.5;

  DELETE FROM hr_employee_salary_structures WHERE employee_id = p_employee_id;

  v_vars := jsonb_build_object(
    'total_salary', v_total_salary,
    'gross_salary', v_total_salary,
    'basic_pay', v_basic_salary,
    'basic_salary', v_basic_salary,
    'basic', v_basic_salary
  );

  FOR v_item IN
    SELECT ti.component_id, ti.calculation_type, ti.value, ti.percentage_of, ti.formula, ti.is_variable,
           sc.code AS comp_code, sc.name AS comp_name, sc.component_type
    FROM hr_salary_structure_template_items ti
    JOIN hr_salary_components sc ON sc.id = ti.component_id
    WHERE ti.template_id = p_template_id
    ORDER BY (ti.calculation_type = 'formula') ASC, ti.created_at ASC
  LOOP
    v_is_pct := false;
    v_amount := 0;

    IF v_item.is_variable = true THEN
      v_amount := 0;
    ELSIF v_item.calculation_type = 'percentage' THEN
      v_is_pct := true;
      IF v_item.percentage_of IN ('basic', 'basic_pay', 'basic_salary') THEN
        v_amount := v_basic_salary * (v_item.value / 100.0);
      ELSIF v_item.percentage_of IN ('gross', 'total', 'total_salary', 'gross_salary') THEN
        v_amount := v_total_salary * (v_item.value / 100.0);
      ELSE
        v_amount := v_basic_salary * (v_item.value / 100.0);
      END IF;
    ELSIF v_item.calculation_type = 'fixed' THEN
      v_amount := COALESCE(v_item.value, 0);
    ELSIF v_item.calculation_type = 'formula' AND v_item.formula IS NOT NULL THEN
      v_formula := lower(trim(v_item.formula));
      
      FOR v_key IN
        SELECT k FROM jsonb_object_keys(v_vars) AS k ORDER BY length(k) DESC
      LOOP
        v_formula := replace(v_formula, v_key, (v_vars->>v_key));
      END LOOP;

      IF v_formula ~ '^[\d\s\+\-\*/\(\)\.]+$' THEN
        BEGIN
          EXECUTE format('SELECT (%s)::numeric', v_formula) INTO v_amount;
        EXCEPTION WHEN OTHERS THEN
          v_amount := 0;
        END;
      ELSE
        v_amount := 0;
      END IF;
    ELSE
      v_amount := COALESCE(v_item.value, 0);
    END IF;

    v_amount := round(v_amount);

    -- COMPLIANCE-V5-02: Enforce EPF statutory cap of ₹1,800/month
    -- EPF Employee (PFE) and EPF Employer (PFC) are capped when calculated as percentage
    IF v_item.comp_code IN ('PFE', 'PFC') AND v_is_pct = true AND v_amount > v_epf_statutory_cap THEN
      RAISE WARNING 'EPF cap applied for % component %: % capped to %', p_employee_id, v_item.comp_code, v_amount, v_epf_statutory_cap;
      v_amount := v_epf_statutory_cap;
    END IF;

    v_comp_code := lower(COALESCE(v_item.comp_code, ''));
    IF v_comp_code <> '' THEN
      v_vars := v_vars || jsonb_build_object(v_comp_code, v_amount);
    END IF;
    IF v_item.comp_name IS NOT NULL THEN
      v_vars := v_vars || jsonb_build_object(
        lower(regexp_replace(regexp_replace(v_item.comp_name, '[^a-zA-Z0-9]+', '_', 'g'), '^_|_$', '', 'g')),
        v_amount
      );
    END IF;

    INSERT INTO hr_employee_salary_structures (employee_id, component_id, amount, is_percentage, is_active)
    VALUES (p_employee_id, v_item.component_id, v_amount, v_is_pct, true);
  END LOOP;

  UPDATE hr_employees
  SET basic_salary = v_basic_salary,
      salary_template_id = p_template_id,
      updated_at = now()
  WHERE id = p_employee_id;
END;
$function$;

-- ============================================================
-- 2. GAP-V5-09: FnF leave encashment auto-calculation
-- Computes encashable leave days and amount for FnF settlement
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_compute_fnf_leave_encashment(p_employee_id uuid)
 RETURNS TABLE(total_encashable_days numeric, encashment_amount numeric, breakdown jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total_salary NUMERIC;
  v_per_day_rate NUMERIC;
  v_total_days NUMERIC := 0;
  v_detail JSONB := '[]'::jsonb;
  v_alloc RECORD;
BEGIN
  -- Get employee salary for per-day calculation
  SELECT e.total_salary INTO v_total_salary
  FROM hr_employees e WHERE e.id = p_employee_id;

  IF v_total_salary IS NULL OR v_total_salary <= 0 THEN
    total_encashable_days := 0;
    encashment_amount := 0;
    breakdown := '[]'::jsonb;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Per-day rate = total_salary / 30 (standard Indian payroll convention)
  v_per_day_rate := round(v_total_salary / 30.0, 2);

  -- Sum available_days across all encashable (carry_forward=true) leave types
  -- for the current year across all quarters
  FOR v_alloc IN
    SELECT lt.name AS leave_name, lt.code,
           SUM(la.available_days) AS avail_days
    FROM hr_leave_allocations la
    JOIN hr_leave_types lt ON lt.id = la.leave_type_id
    WHERE la.employee_id = p_employee_id
      AND lt.carry_forward = true
      AND lt.is_active = true
      AND la.available_days > 0
    GROUP BY lt.name, lt.code
  LOOP
    v_total_days := v_total_days + v_alloc.avail_days;
    v_detail := v_detail || jsonb_build_array(jsonb_build_object(
      'leave_type', v_alloc.leave_name,
      'code', v_alloc.code,
      'days', v_alloc.avail_days,
      'amount', round(v_alloc.avail_days * v_per_day_rate, 2)
    ));
  END LOOP;

  total_encashable_days := v_total_days;
  encashment_amount := round(v_total_days * v_per_day_rate, 2);
  breakdown := v_detail;
  RETURN NEXT;
END;
$function$;

-- Helper: Auto-populate FnF leave encashment fields when status changes to 'calculated'
CREATE OR REPLACE FUNCTION public.fn_auto_compute_fnf_encashment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result RECORD;
BEGIN
  -- Only compute when transitioning TO 'calculated'
  IF NEW.status = 'calculated' AND (OLD.status IS DISTINCT FROM 'calculated') THEN
    SELECT total_encashable_days, encashment_amount
    INTO v_result
    FROM fn_compute_fnf_leave_encashment(NEW.employee_id);

    NEW.leave_encashment_days := COALESCE(v_result.total_encashable_days, 0);
    NEW.leave_encashment_amount := COALESCE(v_result.encashment_amount, 0);
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_auto_compute_fnf_encashment ON hr_fnf_settlements;
CREATE TRIGGER trg_auto_compute_fnf_encashment
  BEFORE UPDATE ON hr_fnf_settlements
  FOR EACH ROW EXECUTE FUNCTION fn_auto_compute_fnf_encashment();
