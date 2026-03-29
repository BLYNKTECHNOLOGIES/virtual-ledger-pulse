
-- ============================================================
-- HRMS V5 — 11 Fixes (P0 + P1 + P2)
-- ============================================================

-- P0-01: Fix fn_lock_attendance_for_completed_payroll (month/year → pay_period range)
CREATE OR REPLACE FUNCTION public.fn_lock_attendance_for_completed_payroll()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_date DATE;
  v_locked BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_date := OLD.attendance_date;
  ELSE
    v_date := NEW.attendance_date;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM hr_payroll_runs
    WHERE status = 'completed'
      AND is_locked = true
      AND pay_period_start <= v_date
      AND pay_period_end >= v_date
  ) INTO v_locked;

  IF v_locked THEN
    RAISE EXCEPTION 'Cannot modify attendance for %: payroll for this period is completed and locked',
      to_char(v_date, 'Mon YYYY');
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

-- P0-02: Re-attach auto_track_late_early BEFORE trigger
DROP TRIGGER IF EXISTS trg_auto_track_late_early ON hr_attendance;
CREATE TRIGGER trg_auto_track_late_early
  BEFORE INSERT OR UPDATE ON hr_attendance
  FOR EACH ROW EXECUTE FUNCTION auto_track_late_early();

-- P0-03: Fix execute_leave_reset ON CONFLICT (add quarter)
CREATE OR REPLACE FUNCTION public.execute_leave_reset(p_year integer DEFAULT (EXTRACT(year FROM CURRENT_DATE))::integer)
 RETURNS TABLE(employee_id uuid, leave_type text, action text, old_balance numeric, new_balance numeric, carried_forward numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  alloc RECORD;
  v_cf NUMERIC;
  v_new_allocated NUMERIC;
  v_expire_date DATE;
BEGIN
  FOR alloc IN 
    SELECT a.*, lt2.name AS lt_name, lt2.max_days_per_year, lt2.carry_forward AS cf_enabled,
           lt2.max_carry_forward_days, lt2.carryforward_type, lt2.carryforward_expire_in,
           lt2.carryforward_expire_period, lt2.reset_based, lt2.reset_month, lt2.reset_day
    FROM hr_leave_allocations a
    JOIN hr_leave_types lt2 ON lt2.id = a.leave_type_id
    WHERE a.year = p_year AND lt2.is_active = true
  LOOP
    v_cf := 0;
    v_expire_date := NULL;
    
    IF alloc.cf_enabled AND alloc.available_days > 0 THEN
      CASE alloc.carryforward_type
        WHEN 'carryforward' THEN
          v_cf := LEAST(alloc.available_days, COALESCE(alloc.max_carry_forward_days, alloc.available_days));
        WHEN 'carryforward_with_expiry' THEN
          v_cf := LEAST(alloc.available_days, COALESCE(alloc.max_carry_forward_days, alloc.available_days));
          v_expire_date := CASE alloc.carryforward_expire_period
            WHEN 'months' THEN (DATE_TRUNC('year', CURRENT_DATE) + INTERVAL '1 year')::DATE + (COALESCE(alloc.carryforward_expire_in, 3) * INTERVAL '1 month')::INTERVAL
            WHEN 'days' THEN (DATE_TRUNC('year', CURRENT_DATE) + INTERVAL '1 year')::DATE + (COALESCE(alloc.carryforward_expire_in, 90) * INTERVAL '1 day')::INTERVAL
            ELSE (DATE_TRUNC('year', CURRENT_DATE) + INTERVAL '1 year' + INTERVAL '3 months')::DATE
          END;
        ELSE
          v_cf := 0;
      END CASE;
    END IF;

    v_new_allocated := COALESCE(alloc.max_days_per_year, 0);

    INSERT INTO hr_leave_allocations (employee_id, leave_type_id, year, quarter, allocated_days, used_days, carry_forward_days, available_days, expired_date)
    VALUES (alloc.employee_id, alloc.leave_type_id, p_year + 1, 1, v_new_allocated, 0, v_cf, v_new_allocated + v_cf, v_expire_date)
    ON CONFLICT (employee_id, leave_type_id, year, quarter)
    DO UPDATE SET 
      allocated_days = v_new_allocated,
      carry_forward_days = v_cf,
      available_days = v_new_allocated + v_cf,
      expired_date = v_expire_date,
      updated_at = now();

    employee_id := alloc.employee_id;
    leave_type := alloc.lt_name;
    action := CASE WHEN v_cf > 0 THEN 'reset_with_carryforward' ELSE 'reset' END;
    old_balance := alloc.available_days;
    new_balance := v_new_allocated + v_cf;
    carried_forward := v_cf;
    RETURN NEXT;
  END LOOP;
END;
$function$;

-- P1-04/05: Fix apply_salary_template (percentage_of matching + formula evaluation)
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

-- P1-06: Block INSERT on locked payroll (fix enforce_payslip_lock + trigger)
CREATE OR REPLACE FUNCTION public.enforce_payslip_lock()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  run_locked BOOLEAN;
  v_run_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_run_id := OLD.payroll_run_id;
  ELSE
    v_run_id := NEW.payroll_run_id;
  END IF;

  SELECT is_locked INTO run_locked
  FROM public.hr_payroll_runs
  WHERE id = v_run_id;

  IF run_locked = true THEN
    RAISE EXCEPTION 'Cannot modify payslip: payroll run % is locked.', v_run_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_payslip_lock ON hr_payslips;
CREATE TRIGGER trg_enforce_payslip_lock
  BEFORE INSERT OR UPDATE OR DELETE ON hr_payslips
  FOR EACH ROW EXECUTE FUNCTION enforce_payslip_lock();

-- P1-07: Drop orphaned leave function
DROP FUNCTION IF EXISTS handle_leave_balance_on_status_change();

-- P2-08: Loan repayment sync on UPDATE/DELETE
CREATE OR REPLACE FUNCTION public.fn_sync_loan_balance_on_repayment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE hr_loans
    SET outstanding_balance = COALESCE(
      (SELECT balance_after FROM hr_loan_repayments 
       WHERE loan_id = OLD.loan_id ORDER BY payment_date DESC, created_at DESC LIMIT 1),
      loan_amount
    ),
    status = CASE 
      WHEN COALESCE(
        (SELECT balance_after FROM hr_loan_repayments 
         WHERE loan_id = OLD.loan_id ORDER BY payment_date DESC, created_at DESC LIMIT 1),
        loan_amount
      ) <= 0 THEN 'closed' 
      ELSE CASE WHEN status = 'closed' THEN 'active' ELSE status END
    END,
    updated_at = now()
    WHERE id = OLD.loan_id;
    RETURN OLD;
  END IF;

  UPDATE hr_loans
  SET outstanding_balance = NEW.balance_after,
      status = CASE WHEN NEW.balance_after <= 0 THEN 'closed' ELSE status END,
      updated_at = now()
  WHERE id = NEW.loan_id;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_loan_balance ON hr_loan_repayments;
CREATE TRIGGER trg_sync_loan_balance
  AFTER INSERT OR UPDATE OR DELETE ON hr_loan_repayments
  FOR EACH ROW EXECUTE FUNCTION fn_sync_loan_balance_on_repayment();

-- P2-08: Deposit transaction sync on UPDATE/DELETE
CREATE OR REPLACE FUNCTION public.fn_sync_deposit_balance_on_transaction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE hr_employee_deposits
    SET current_balance = COALESCE(
      (SELECT balance_after FROM hr_deposit_transactions 
       WHERE deposit_id = OLD.deposit_id ORDER BY transaction_date DESC, created_at DESC LIMIT 1),
      0
    ),
    collected_amount = COALESCE(
      (SELECT SUM(amount) FROM hr_deposit_transactions 
       WHERE deposit_id = OLD.deposit_id AND transaction_type = 'collection'),
      0
    ),
    is_fully_collected = CASE 
      WHEN COALESCE(
        (SELECT balance_after FROM hr_deposit_transactions 
         WHERE deposit_id = OLD.deposit_id ORDER BY transaction_date DESC, created_at DESC LIMIT 1),
        0
      ) >= total_deposit_amount THEN true ELSE false 
    END,
    updated_at = now()
    WHERE id = OLD.deposit_id;
    RETURN OLD;
  END IF;

  UPDATE hr_employee_deposits
  SET current_balance = NEW.balance_after,
      collected_amount = COALESCE(
        (SELECT SUM(amount) FROM hr_deposit_transactions 
         WHERE deposit_id = NEW.deposit_id AND transaction_type = 'collection'),
        0
      ),
      is_fully_collected = CASE WHEN NEW.balance_after >= total_deposit_amount THEN true ELSE false END,
      updated_at = now()
  WHERE id = NEW.deposit_id;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_deposit_balance ON hr_deposit_transactions;
CREATE TRIGGER trg_sync_deposit_balance
  AFTER INSERT OR UPDATE OR DELETE ON hr_deposit_transactions
  FOR EACH ROW EXECUTE FUNCTION fn_sync_deposit_balance_on_transaction();

-- P2-09: Loan state machine transitions
CREATE OR REPLACE FUNCTION public.fn_validate_loan_status()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.status NOT IN ('pending', 'approved', 'rejected', 'active', 'closed') THEN
    RAISE EXCEPTION 'Invalid loan status: %. Allowed: pending, approved, rejected, active, closed', NEW.status;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending' THEN
      RAISE EXCEPTION 'New loans must start with status pending, got: %', NEW.status;
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  CASE OLD.status
    WHEN 'pending' THEN
      IF NEW.status NOT IN ('approved', 'rejected') THEN
        RAISE EXCEPTION 'Loan cannot transition from pending to %. Allowed: approved, rejected', NEW.status;
      END IF;
    WHEN 'approved' THEN
      IF NEW.status NOT IN ('active', 'rejected') THEN
        RAISE EXCEPTION 'Loan cannot transition from approved to %. Allowed: active, rejected', NEW.status;
      END IF;
    WHEN 'active' THEN
      IF NEW.status NOT IN ('closed') THEN
        RAISE EXCEPTION 'Loan cannot transition from active to %. Allowed: closed', NEW.status;
      END IF;
    WHEN 'rejected' THEN
      RAISE EXCEPTION 'Loan status "rejected" is terminal and cannot be changed';
    WHEN 'closed' THEN
      RAISE EXCEPTION 'Loan status "closed" is terminal and cannot be changed';
    ELSE
      RAISE EXCEPTION 'Unknown current loan status: %', OLD.status;
  END CASE;

  RETURN NEW;
END;
$function$;

-- P2-10: Alternating weekly offs
CREATE OR REPLACE FUNCTION public.fn_calculate_working_days(p_employee_id uuid, p_start date, p_end date)
 RETURNS integer
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
  v_week_num INTEGER;
BEGIN
  v_calendar_days := (p_end - p_start) + 1;

  SELECT COUNT(*) INTO v_holidays
  FROM hr_holidays
  WHERE date BETWEEN p_start AND p_end
    AND is_active = true;

  v_weekly_offs := 0;
  SELECT wop.weekly_offs, wop.is_alternating, wop.alternate_week_offs
  INTO v_pattern
  FROM hr_employee_weekly_off ewo
  JOIN hr_weekly_off_patterns wop ON wop.id = ewo.pattern_id
  WHERE ewo.employee_id = p_employee_id
    AND ewo.is_current = true
  LIMIT 1;

  IF v_pattern IS NOT NULL THEN
    v_day := p_start;
    WHILE v_day <= p_end LOOP
      v_dow := EXTRACT(DOW FROM v_day)::INTEGER;

      IF v_dow = ANY(v_pattern.weekly_offs::INT[]) THEN
        IF NOT EXISTS (SELECT 1 FROM hr_holidays WHERE date = v_day AND is_active = true) THEN
          v_weekly_offs := v_weekly_offs + 1;
        END IF;
      ELSIF v_pattern.is_alternating = true 
            AND v_pattern.alternate_week_offs IS NOT NULL 
            AND v_dow = ANY(v_pattern.alternate_week_offs::INT[]) THEN
        v_week_num := EXTRACT(WEEK FROM v_day)::INTEGER;
        IF v_week_num % 2 = 1 THEN
          IF NOT EXISTS (SELECT 1 FROM hr_holidays WHERE date = v_day AND is_active = true) THEN
            v_weekly_offs := v_weekly_offs + 1;
          END IF;
        END IF;
      END IF;

      v_day := v_day + 1;
    END LOOP;
  END IF;

  RETURN GREATEST(v_calendar_days - v_holidays - v_weekly_offs, 0);
END;
$function$;

-- P2-11: Cleanup — Drop duplicate index + RLS policies
DROP INDEX IF EXISTS idx_daily_emp_date;

DROP POLICY IF EXISTS "Allow all for authenticated users" ON hr_deposit_transactions;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON hr_employee_deposits;
DROP POLICY IF EXISTS "Authenticated users can manage onboarding stages" ON hr_onboarding_stages;
DROP POLICY IF EXISTS "Authenticated users can view onboarding stages" ON hr_onboarding_stages;
DROP POLICY IF EXISTS "Authenticated users can manage onboarding tasks" ON hr_onboarding_tasks;
DROP POLICY IF EXISTS "Authenticated users can view onboarding tasks" ON hr_onboarding_tasks;
DROP POLICY IF EXISTS "Authenticated users can manage onboarding task employees" ON hr_onboarding_task_employees;
DROP POLICY IF EXISTS "Authenticated users can view onboarding task employees" ON hr_onboarding_task_employees;
