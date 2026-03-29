-- ====================================================================
-- GAP-V5-03 + GAP-V5-08: Server-side Payroll Engine RPC
-- GAP-V5-11: Cross-quarter leave validation
-- ====================================================================

-- 1. Add missing columns to hr_payslips for full parity
ALTER TABLE hr_payslips ADD COLUMN IF NOT EXISTS sunday_days_worked numeric DEFAULT 0;
ALTER TABLE hr_payslips ADD COLUMN IF NOT EXISTS holiday_days_worked numeric DEFAULT 0;
ALTER TABLE hr_payslips ADD COLUMN IF NOT EXISTS penalty_amount numeric DEFAULT 0;

-- 2. Server-side payroll engine
CREATE OR REPLACE FUNCTION fn_generate_payroll(p_payroll_run_id uuid, p_triggered_by uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run RECORD;
  v_emp RECORD;
  v_item RECORD;
  v_att RECORD;
  v_penalty RECORD;
  v_loan RECORD;
  v_deposit RECORD;
  
  v_working_days integer;
  v_present_days numeric;
  v_leave_days numeric;
  v_attendance_ratio numeric;
  v_total_salary numeric;
  v_basic_salary numeric;
  
  v_vars jsonb;
  v_amount numeric;
  v_formula text;
  v_key text;
  v_comp_code text;
  v_epf_cap constant numeric := 1800;
  
  v_earnings_breakdown jsonb;
  v_deductions_breakdown jsonb;
  v_total_earnings numeric;
  v_total_deductions numeric;
  v_gross_salary numeric;
  v_net_salary numeric;
  v_per_day_pay numeric;
  v_full_month_earnings numeric;
  
  v_penalty_days numeric;
  v_penalty_fixed numeric;
  v_penalty_deposit_fixed numeric;
  v_penalty_deduction numeric;
  v_penalty_ids uuid[];
  
  v_sunday_worked numeric;
  v_holiday_worked numeric;
  v_overtime_hours numeric;
  
  v_lop_days numeric;
  v_lop_deduction numeric;
  
  v_loan_deduction numeric;
  v_emi numeric;
  
  v_deposit_deduction numeric;
  v_deposit_replenish numeric;
  v_installment numeric;
  v_remaining numeric;
  v_net_before_deposit numeric;
  
  v_tds_amount numeric;
  v_annual_gross numeric;
  v_tax_result numeric;
  
  v_payslip_count integer := 0;
  v_total_gross_sum numeric := 0;
  v_total_ded_sum numeric := 0;
  v_total_net_sum numeric := 0;
  
  v_holiday_dates date[];
  v_day date;
  v_dow integer;
  
BEGIN
  SELECT * INTO v_run FROM hr_payroll_runs WHERE id = p_payroll_run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll run % not found', p_payroll_run_id;
  END IF;
  IF v_run.is_locked THEN
    RAISE EXCEPTION 'Payroll run % is locked', p_payroll_run_id;
  END IF;
  IF v_run.status NOT IN ('draft', 'processing', 'reviewed') THEN
    RAISE EXCEPTION 'Cannot generate payslips for status %', v_run.status;
  END IF;
  
  SELECT array_agg(date) INTO v_holiday_dates
  FROM hr_holidays
  WHERE date BETWEEN v_run.pay_period_start AND v_run.pay_period_end
    AND is_active = true;
  v_holiday_dates := COALESCE(v_holiday_dates, ARRAY[]::date[]);
  
  v_working_days := 0;
  v_day := v_run.pay_period_start;
  WHILE v_day <= v_run.pay_period_end LOOP
    v_dow := EXTRACT(DOW FROM v_day)::integer;
    IF v_dow != 0 AND NOT (v_day = ANY(v_holiday_dates)) THEN
      v_working_days := v_working_days + 1;
    END IF;
    v_day := v_day + 1;
  END LOOP;
  
  DELETE FROM hr_payslips WHERE payroll_run_id = p_payroll_run_id;
  
  FOR v_emp IN
    SELECT id, first_name, last_name, total_salary, basic_salary, 
           salary_structure_template_id, filing_status_id
    FROM hr_employees
    WHERE is_active = true
  LOOP
    v_total_salary := COALESCE(v_emp.total_salary, 0);
    v_basic_salary := COALESCE(v_emp.basic_salary, v_total_salary * 0.5);
    v_earnings_breakdown := '{}'::jsonb;
    v_deductions_breakdown := '{}'::jsonb;
    v_total_earnings := 0;
    v_total_deductions := 0;
    
    v_present_days := 0;
    v_overtime_hours := 0;
    v_sunday_worked := 0;
    v_holiday_worked := 0;
    
    FOR v_att IN
      SELECT attendance_date, attendance_status, overtime_hours
      FROM hr_attendance
      WHERE employee_id = v_emp.id
        AND attendance_date BETWEEN v_run.pay_period_start AND v_run.pay_period_end
    LOOP
      IF v_att.attendance_status IN ('present', 'late', 'half_day') THEN
        IF v_att.attendance_status = 'half_day' THEN
          v_present_days := v_present_days + 0.5;
        ELSE
          v_present_days := v_present_days + 1;
        END IF;
        
        v_dow := EXTRACT(DOW FROM v_att.attendance_date)::integer;
        IF v_dow = 0 THEN
          v_sunday_worked := v_sunday_worked + (CASE WHEN v_att.attendance_status = 'half_day' THEN 0.5 ELSE 1 END);
        END IF;
        IF v_att.attendance_date = ANY(v_holiday_dates) THEN
          v_holiday_worked := v_holiday_worked + (CASE WHEN v_att.attendance_status = 'half_day' THEN 0.5 ELSE 1 END);
        END IF;
      END IF;
      v_overtime_hours := v_overtime_hours + COALESCE(v_att.overtime_hours, 0);
    END LOOP;
    
    v_leave_days := 0;
    SELECT COALESCE(SUM(total_days), 0) INTO v_leave_days
    FROM hr_leave_requests
    WHERE employee_id = v_emp.id
      AND status = 'approved'
      AND start_date <= v_run.pay_period_end
      AND end_date >= v_run.pay_period_start;
    
    IF v_present_days = 0 AND v_leave_days = 0 THEN
      IF NOT EXISTS (
        SELECT 1 FROM hr_attendance
        WHERE employee_id = v_emp.id
          AND attendance_date BETWEEN v_run.pay_period_start AND v_run.pay_period_end
      ) THEN
        v_present_days := v_working_days;
      END IF;
    ELSE
      v_present_days := LEAST(v_present_days + v_leave_days, v_working_days);
    END IF;
    
    v_attendance_ratio := CASE WHEN v_working_days > 0 THEN v_present_days / v_working_days ELSE 1 END;
    
    IF v_emp.salary_structure_template_id IS NOT NULL AND v_total_salary > 0 THEN
      v_vars := jsonb_build_object(
        'total_salary', v_total_salary,
        'gross_salary', v_total_salary,
        'basic_pay', v_basic_salary,
        'basic_salary', v_basic_salary,
        'basic', v_basic_salary
      );
      
      FOR v_item IN
        SELECT ti.calculation_type, ti.value, ti.percentage_of, ti.formula, ti.is_variable,
               sc.code AS comp_code, sc.name AS comp_name, sc.component_type
        FROM hr_salary_structure_template_items ti
        JOIN hr_salary_components sc ON sc.id = ti.component_id
        WHERE ti.template_id = v_emp.salary_structure_template_id
        ORDER BY (ti.calculation_type = 'formula') ASC, ti.created_at ASC
      LOOP
        IF v_item.is_variable = true THEN
          CONTINUE;
        END IF;
        
        v_amount := 0;
        
        IF v_item.calculation_type = 'percentage' THEN
          IF v_item.percentage_of IN ('basic', 'basic_pay', 'basic_salary') THEN
            v_amount := v_basic_salary * (v_item.value / 100.0);
          ELSIF v_item.percentage_of IN ('gross', 'total', 'total_salary', 'gross_salary') THEN
            v_amount := v_total_salary * (v_item.value / 100.0);
          ELSE
            v_amount := v_basic_salary * (v_item.value / 100.0);
          END IF;
        ELSIF v_item.calculation_type = 'formula' AND v_item.formula IS NOT NULL THEN
          v_formula := lower(trim(v_item.formula));
          FOR v_key IN SELECT k FROM jsonb_object_keys(v_vars) AS k ORDER BY length(k) DESC LOOP
            v_formula := replace(v_formula, v_key, (v_vars->>v_key));
          END LOOP;
          IF v_formula ~ '^[\d\s\+\-\*/\(\)\.]+$' THEN
            BEGIN
              EXECUTE format('SELECT (%s)::numeric', v_formula) INTO v_amount;
            EXCEPTION WHEN OTHERS THEN
              v_amount := 0;
            END;
          END IF;
        ELSE
          v_amount := COALESCE(v_item.value, 0);
        END IF;
        
        v_amount := round(v_amount);
        
        v_comp_code := lower(COALESCE(v_item.comp_code, ''));
        IF v_comp_code IN ('pfe', 'pfc') AND v_item.calculation_type = 'percentage' AND v_amount > v_epf_cap THEN
          v_amount := v_epf_cap;
        END IF;
        
        IF v_comp_code <> '' THEN
          v_vars := v_vars || jsonb_build_object(v_comp_code, v_amount);
        END IF;
        IF v_item.comp_name IS NOT NULL THEN
          v_vars := v_vars || jsonb_build_object(
            lower(regexp_replace(regexp_replace(v_item.comp_name, '[^a-zA-Z0-9]+', '_', 'g'), '^_|_$', '', 'g')),
            v_amount
          );
        END IF;
        
        IF v_item.component_type = 'allowance' THEN
          v_amount := round(v_amount * v_attendance_ratio);
          v_earnings_breakdown := v_earnings_breakdown || jsonb_build_object(v_item.comp_name, v_amount);
          v_total_earnings := v_total_earnings + v_amount;
        ELSIF v_item.component_type = 'deduction' THEN
          IF NOT (lower(v_item.comp_name) LIKE '%employer%' OR v_comp_code IN ('pfc', 'esic')) THEN
            v_deductions_breakdown := v_deductions_breakdown || jsonb_build_object(v_item.comp_name, v_amount);
            v_total_deductions := v_total_deductions + v_amount;
          END IF;
        END IF;
      END LOOP;
    ELSIF v_basic_salary > 0 THEN
      v_amount := round(v_basic_salary * v_attendance_ratio);
      v_earnings_breakdown := jsonb_build_object('Basic Salary', v_amount);
      v_total_earnings := v_amount;
    END IF;
    
    v_full_month_earnings := CASE WHEN v_total_earnings > 0 AND v_attendance_ratio > 0
      THEN round(v_total_earnings / v_attendance_ratio) ELSE v_total_salary END;
    v_per_day_pay := CASE WHEN v_working_days > 0 THEN round(v_full_month_earnings / v_working_days) ELSE 0 END;
    
    IF v_sunday_worked > 0 AND v_per_day_pay > 0 THEN
      v_amount := round(v_per_day_pay * v_sunday_worked);
      v_earnings_breakdown := v_earnings_breakdown || jsonb_build_object('Sunday OT Pay', v_amount);
      v_total_earnings := v_total_earnings + v_amount;
    END IF;
    
    IF v_holiday_worked > 0 AND v_per_day_pay > 0 THEN
      v_amount := round(v_per_day_pay * v_holiday_worked);
      v_earnings_breakdown := v_earnings_breakdown || jsonb_build_object('Holiday OT Pay', v_amount);
      v_total_earnings := v_total_earnings + v_amount;
    END IF;
    
    v_penalty_days := 0;
    v_penalty_fixed := 0;
    v_penalty_deposit_fixed := 0;
    v_penalty_deduction := 0;
    v_penalty_ids := ARRAY[]::uuid[];
    
    FOR v_penalty IN
      SELECT id, penalty_days, penalty_amount, deduct_from_deposit, penalty_reason
      FROM hr_penalties
      WHERE employee_id = v_emp.id
        AND penalty_month = to_char(v_run.pay_period_start, 'YYYY-MM')
        AND is_applied = false
    LOOP
      v_penalty_ids := array_append(v_penalty_ids, v_penalty.id);
      IF v_penalty.deduct_from_deposit = true THEN
        v_penalty_deposit_fixed := v_penalty_deposit_fixed + COALESCE(v_penalty.penalty_amount, 0);
      ELSE
        v_penalty_days := v_penalty_days + COALESCE(v_penalty.penalty_days, 0);
        v_penalty_fixed := v_penalty_fixed + COALESCE(v_penalty.penalty_amount, 0);
      END IF;
    END LOOP;
    
    IF v_penalty_days > 0 AND v_per_day_pay > 0 THEN
      v_penalty_deduction := round(v_per_day_pay * v_penalty_days);
      v_deductions_breakdown := v_deductions_breakdown || jsonb_build_object(
        'Late Penalty (' || v_penalty_days || ' day' || CASE WHEN v_penalty_days > 1 THEN 's' ELSE '' END || ')', 
        v_penalty_deduction
      );
      v_total_deductions := v_total_deductions + v_penalty_deduction;
    END IF;
    IF v_penalty_fixed > 0 THEN
      v_deductions_breakdown := v_deductions_breakdown || jsonb_build_object('Manual Penalty', v_penalty_fixed);
      v_total_deductions := v_total_deductions + v_penalty_fixed;
      v_penalty_deduction := v_penalty_deduction + v_penalty_fixed;
    END IF;
    
    v_lop_days := GREATEST(0, v_working_days - v_present_days);
    v_lop_deduction := CASE WHEN v_lop_days > 0 AND v_per_day_pay > 0 THEN round(v_per_day_pay * v_lop_days) ELSE 0 END;
    IF v_lop_deduction > 0 THEN
      v_deductions_breakdown := v_deductions_breakdown || jsonb_build_object('LOP Deduction', v_lop_deduction);
      v_total_deductions := v_total_deductions + v_lop_deduction;
    END IF;
    
    v_tds_amount := 0;
    IF v_emp.filing_status_id IS NOT NULL AND v_total_earnings > 0 THEN
      v_annual_gross := v_total_earnings * 12;
      BEGIN
        SELECT compute_annual_tax(v_annual_gross, v_emp.filing_status_id) INTO v_tax_result;
        IF v_tax_result > 0 THEN
          v_tds_amount := round(v_tax_result / 12);
          v_deductions_breakdown := v_deductions_breakdown || jsonb_build_object('TDS (Income Tax)', v_tds_amount);
          v_total_deductions := v_total_deductions + v_tds_amount;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_tds_amount := 0;
      END;
    END IF;
    
    v_loan_deduction := 0;
    FOR v_loan IN
      SELECT id, loan_type, emi_amount, outstanding_balance
      FROM hr_loans
      WHERE employee_id = v_emp.id AND status = 'active' AND outstanding_balance > 0
    LOOP
      v_emi := LEAST(v_loan.emi_amount, v_loan.outstanding_balance);
      IF v_emi > 0 THEN
        v_loan_deduction := v_loan_deduction + v_emi;
        v_deductions_breakdown := v_deductions_breakdown || jsonb_build_object(
          'Loan EMI (' || replace(COALESCE(v_loan.loan_type, 'loan'), '_', ' ') || ')', v_emi
        );
        INSERT INTO hr_loan_repayments (loan_id, employee_id, amount, repayment_date, repayment_type, payroll_run_id, balance_after)
        VALUES (v_loan.id, v_emp.id, v_emi, v_run.pay_period_end, 'payroll', p_payroll_run_id, v_loan.outstanding_balance - v_emi);
        UPDATE hr_loans SET outstanding_balance = outstanding_balance - v_emi, updated_at = now() WHERE id = v_loan.id;
        IF v_loan.outstanding_balance - v_emi <= 0 THEN
          UPDATE hr_loans SET status = 'closed', updated_at = now() WHERE id = v_loan.id;
        END IF;
      END IF;
    END LOOP;
    v_total_deductions := v_total_deductions + v_loan_deduction;
    
    v_deposit_deduction := 0;
    v_deposit_replenish := 0;
    v_gross_salary := v_total_earnings;
    
    FOR v_deposit IN
      SELECT id, total_deposit_amount, collected_amount, current_balance,
             deduction_mode, deduction_value, is_fully_collected, is_paused
      FROM hr_employee_deposits
      WHERE employee_id = v_emp.id
        AND is_settled = false
        AND (is_paused IS NULL OR is_paused = false)
    LOOP
      IF v_penalty_deposit_fixed > 0 AND v_deposit.current_balance > 0 THEN
        v_amount := LEAST(v_penalty_deposit_fixed, v_deposit.current_balance);
        v_deposit.current_balance := v_deposit.current_balance - v_amount;
        INSERT INTO hr_deposit_transactions (employee_id, deposit_id, transaction_type, amount, balance_after, description, transaction_date, payroll_run_id)
        VALUES (v_emp.id, v_deposit.id, 'penalty_deduction', -v_amount, v_deposit.current_balance, 'Penalty deducted from deposit', v_run.pay_period_end, p_payroll_run_id);
        v_penalty_deposit_fixed := v_penalty_deposit_fixed - v_amount;
      END IF;
      
      IF NOT v_deposit.is_fully_collected THEN
        v_remaining := v_deposit.total_deposit_amount - v_deposit.collected_amount;
        IF v_remaining > 0 THEN
          IF v_deposit.deduction_mode = 'one_time' THEN
            v_installment := v_remaining;
          ELSIF v_deposit.deduction_mode = 'percentage' THEN
            v_installment := round((v_deposit.deduction_value / 100) * v_gross_salary);
          ELSE
            v_installment := v_deposit.deduction_value;
          END IF;
          v_installment := LEAST(v_installment, v_remaining);
          v_net_before_deposit := v_total_earnings - v_total_deductions;
          IF v_net_before_deposit <= 0 THEN
            v_installment := 0;
          ELSE
            v_installment := LEAST(v_installment, v_net_before_deposit);
          END IF;
          IF v_installment > 0 THEN
            v_deposit_deduction := v_deposit_deduction + v_installment;
            v_deductions_breakdown := v_deductions_breakdown || jsonb_build_object('Security Deposit', v_installment);
            v_total_deductions := v_total_deductions + v_installment;
            v_deposit.collected_amount := v_deposit.collected_amount + v_installment;
            v_deposit.current_balance := v_deposit.current_balance + v_installment;
            INSERT INTO hr_deposit_transactions (employee_id, deposit_id, transaction_type, amount, balance_after, description, transaction_date, payroll_run_id)
            VALUES (v_emp.id, v_deposit.id, 'collection', v_installment, v_deposit.current_balance, 'Deposit collection via payroll', v_run.pay_period_end, p_payroll_run_id);
            IF v_deposit.collected_amount >= v_deposit.total_deposit_amount THEN
              v_deposit.is_fully_collected := true;
              INSERT INTO hr_deposit_transactions (employee_id, deposit_id, transaction_type, amount, balance_after, description, transaction_date, payroll_run_id)
              VALUES (v_emp.id, v_deposit.id, 'completed', 0, v_deposit.current_balance, 'Deposit fully collected', v_run.pay_period_end, p_payroll_run_id);
            END IF;
          END IF;
        END IF;
      END IF;
      
      IF v_deposit.is_fully_collected AND v_deposit.current_balance < v_deposit.collected_amount THEN
        v_remaining := v_deposit.collected_amount - v_deposit.current_balance;
        IF v_deposit.deduction_mode = 'percentage' THEN
          v_amount := round((v_deposit.deduction_value / 100) * v_gross_salary);
        ELSE
          v_amount := v_deposit.deduction_value;
        END IF;
        v_amount := LEAST(v_amount, v_remaining);
        IF v_amount > 0 THEN
          v_deposit_replenish := v_deposit_replenish + v_amount;
          v_deductions_breakdown := v_deductions_breakdown || jsonb_build_object('Deposit Replenishment', v_amount);
          v_total_deductions := v_total_deductions + v_amount;
          v_deposit.current_balance := v_deposit.current_balance + v_amount;
          INSERT INTO hr_deposit_transactions (employee_id, deposit_id, transaction_type, amount, balance_after, description, transaction_date, payroll_run_id)
          VALUES (v_emp.id, v_deposit.id, 'replenishment', v_amount, v_deposit.current_balance, 'Deposit replenishment after penalty', v_run.pay_period_end, p_payroll_run_id);
        END IF;
      END IF;
      
      UPDATE hr_employee_deposits SET
        collected_amount = v_deposit.collected_amount,
        current_balance = v_deposit.current_balance,
        is_fully_collected = v_deposit.is_fully_collected,
        updated_at = now()
      WHERE id = v_deposit.id;
    END LOOP;
    
    v_net_salary := v_total_earnings - v_total_deductions;
    
    INSERT INTO hr_payslips (
      payroll_run_id, employee_id, gross_salary, total_earnings, total_deductions,
      net_salary, earnings_breakdown, deductions_breakdown, working_days, present_days,
      leave_days, lop_days, lop_deduction, overtime_hours, sunday_days_worked,
      holiday_days_worked, penalty_amount, tds_amount, status
    ) VALUES (
      p_payroll_run_id, v_emp.id, v_total_earnings, v_total_earnings, v_total_deductions,
      v_net_salary, v_earnings_breakdown, v_deductions_breakdown, v_working_days, v_present_days,
      v_leave_days, v_lop_days, v_lop_deduction, v_overtime_hours, v_sunday_worked,
      v_holiday_worked, v_penalty_deduction, v_tds_amount, 'draft'
    );
    
    IF array_length(v_penalty_ids, 1) > 0 THEN
      UPDATE hr_penalties SET
        is_applied = true,
        applied_at = now(),
        payroll_run_id = p_payroll_run_id
      WHERE id = ANY(v_penalty_ids);
    END IF;
    
    v_payslip_count := v_payslip_count + 1;
    v_total_gross_sum := v_total_gross_sum + v_total_earnings;
    v_total_ded_sum := v_total_ded_sum + v_total_deductions;
    v_total_net_sum := v_total_net_sum + v_net_salary;
  END LOOP;
  
  UPDATE hr_payroll_runs SET
    total_gross = v_total_gross_sum,
    total_deductions = v_total_ded_sum,
    total_net = v_total_net_sum,
    employee_count = v_payslip_count,
    status = 'processing',
    processed_by = p_triggered_by,
    updated_at = now()
  WHERE id = p_payroll_run_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'payslip_count', v_payslip_count,
    'total_gross', v_total_gross_sum,
    'total_deductions', v_total_ded_sum,
    'total_net', v_total_net_sum
  );
END;
$$;

-- ====================================================================
-- GAP-V5-11: Cross-quarter leave validation
-- ====================================================================

CREATE OR REPLACE FUNCTION fn_validate_leave_balance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_available numeric;
  v_leave_code text;
  v_quarter_start int;
  v_quarter_end int;
  v_computed_days numeric;
  v_q1_boundary date;
  v_days_in_q1 numeric;
  v_days_in_q2 numeric;
  v_avail_q1 numeric;
  v_avail_q2 numeric;
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    SELECT code INTO v_leave_code FROM hr_leave_types WHERE id = NEW.leave_type_id;
    IF v_leave_code = 'LOP' THEN
      RETURN NEW;
    END IF;

    IF NEW.is_half_day = true THEN
      v_computed_days := 0.5;
    ELSE
      v_computed_days := fn_calculate_working_days(NEW.employee_id, NEW.start_date, NEW.end_date);
    END IF;

    IF v_computed_days > 0 AND v_computed_days <> NEW.total_days THEN
      RAISE WARNING 'Correcting total_days from % to % (server-computed)', NEW.total_days, v_computed_days;
      NEW.total_days := v_computed_days;
    END IF;

    v_quarter_start := CEIL(EXTRACT(MONTH FROM NEW.start_date) / 3.0)::int;
    v_quarter_end := CEIL(EXTRACT(MONTH FROM NEW.end_date) / 3.0)::int;

    -- Same year, different quarter = cross-quarter leave
    IF EXTRACT(YEAR FROM NEW.start_date) = EXTRACT(YEAR FROM NEW.end_date) 
       AND v_quarter_start <> v_quarter_end THEN
      
      v_q1_boundary := make_date(
        EXTRACT(YEAR FROM NEW.start_date)::int,
        (v_quarter_start * 3 + 1),
        1
      );
      
      v_days_in_q1 := fn_calculate_working_days(NEW.employee_id, NEW.start_date, v_q1_boundary - 1);
      v_days_in_q2 := NEW.total_days - v_days_in_q1;
      
      SELECT available_days INTO v_avail_q1
      FROM hr_leave_allocations
      WHERE employee_id = NEW.employee_id
        AND leave_type_id = NEW.leave_type_id
        AND year = EXTRACT(YEAR FROM NEW.start_date)::int
        AND quarter = v_quarter_start;
      
      IF v_avail_q1 IS NULL THEN
        RAISE EXCEPTION 'No leave allocation for year % quarter %', EXTRACT(YEAR FROM NEW.start_date)::int, v_quarter_start;
      END IF;
      IF v_avail_q1 < v_days_in_q1 THEN
        RAISE EXCEPTION 'Insufficient Q% balance. Available: %, Needed: %', v_quarter_start, v_avail_q1, v_days_in_q1;
      END IF;
      
      SELECT available_days INTO v_avail_q2
      FROM hr_leave_allocations
      WHERE employee_id = NEW.employee_id
        AND leave_type_id = NEW.leave_type_id
        AND year = EXTRACT(YEAR FROM NEW.end_date)::int
        AND quarter = v_quarter_end;
      
      IF v_avail_q2 IS NULL THEN
        RAISE EXCEPTION 'No leave allocation for year % quarter %', EXTRACT(YEAR FROM NEW.end_date)::int, v_quarter_end;
      END IF;
      IF v_avail_q2 < v_days_in_q2 THEN
        RAISE EXCEPTION 'Insufficient Q% balance. Available: %, Needed: %', v_quarter_end, v_avail_q2, v_days_in_q2;
      END IF;
      
      RETURN NEW;
    END IF;

    SELECT available_days INTO v_available
    FROM hr_leave_allocations
    WHERE employee_id = NEW.employee_id
      AND leave_type_id = NEW.leave_type_id
      AND year = EXTRACT(YEAR FROM NEW.start_date)::int
      AND quarter = v_quarter_start;

    IF v_available IS NULL THEN
      RAISE EXCEPTION 'No leave allocation found for this employee and leave type for year % quarter %', EXTRACT(YEAR FROM NEW.start_date)::int, v_quarter_start;
    END IF;

    IF v_available < NEW.total_days THEN
      RAISE EXCEPTION 'Insufficient leave balance. Available: %, Requested: %', v_available, NEW.total_days;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Fix fn_leave_balance_on_status_change for cross-quarter deductions
CREATE OR REPLACE FUNCTION fn_leave_balance_on_status_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_year_start INT;
  v_quarter_start INT;
  v_year_end INT;
  v_quarter_end INT;
  v_year_boundary DATE;
  v_q_boundary DATE;
  v_days_before NUMERIC;
  v_days_after NUMERIC;
  v_rows_affected INT;
BEGIN
  v_year_start := EXTRACT(YEAR FROM NEW.start_date)::INT;
  v_year_end := EXTRACT(YEAR FROM NEW.end_date)::INT;
  v_quarter_start := CEIL(EXTRACT(MONTH FROM NEW.start_date) / 3.0)::INT;
  v_quarter_end := CEIL(EXTRACT(MONTH FROM NEW.end_date) / 3.0)::INT;

  -- CROSS-YEAR BOUNDARY
  IF v_year_start != v_year_end THEN
    v_year_boundary := make_date(v_year_end, 1, 1);
    v_days_before := fn_calculate_working_days(NEW.employee_id, NEW.start_date, v_year_boundary - 1);
    v_days_after := NEW.total_days - v_days_before;
    v_quarter_end := CEIL(EXTRACT(MONTH FROM v_year_boundary) / 3.0)::INT;

    IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
      UPDATE hr_leave_allocations
      SET available_days = available_days - v_days_before, used_days = used_days + v_days_before, updated_at = now()
      WHERE employee_id = NEW.employee_id AND leave_type_id = NEW.leave_type_id
        AND year = v_year_start AND quarter = v_quarter_start;
      GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
      IF v_rows_affected = 0 THEN RAISE WARNING 'No allocation for year %, quarter %', v_year_start, v_quarter_start; END IF;

      UPDATE hr_leave_allocations
      SET available_days = available_days - v_days_after, used_days = used_days + v_days_after, updated_at = now()
      WHERE employee_id = NEW.employee_id AND leave_type_id = NEW.leave_type_id
        AND year = v_year_end AND quarter = v_quarter_end;
    END IF;

    IF (NEW.status IN ('cancelled', 'rejected')) AND OLD.status = 'approved' THEN
      UPDATE hr_leave_allocations
      SET available_days = available_days + v_days_before, used_days = GREATEST(used_days - v_days_before, 0), updated_at = now()
      WHERE employee_id = NEW.employee_id AND leave_type_id = NEW.leave_type_id
        AND year = v_year_start AND quarter = v_quarter_start;

      UPDATE hr_leave_allocations
      SET available_days = available_days + v_days_after, used_days = GREATEST(used_days - v_days_after, 0), updated_at = now()
      WHERE employee_id = NEW.employee_id AND leave_type_id = NEW.leave_type_id
        AND year = v_year_end AND quarter = v_quarter_end;
    END IF;

    RETURN NEW;
  END IF;

  -- CROSS-QUARTER (SAME YEAR)
  IF v_quarter_start != v_quarter_end THEN
    v_q_boundary := make_date(v_year_start, v_quarter_start * 3 + 1, 1);
    v_days_before := fn_calculate_working_days(NEW.employee_id, NEW.start_date, v_q_boundary - 1);
    v_days_after := NEW.total_days - v_days_before;

    IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
      UPDATE hr_leave_allocations
      SET available_days = available_days - v_days_before, used_days = used_days + v_days_before, updated_at = now()
      WHERE employee_id = NEW.employee_id AND leave_type_id = NEW.leave_type_id
        AND year = v_year_start AND quarter = v_quarter_start;
      GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
      IF v_rows_affected = 0 THEN RAISE WARNING 'No allocation for Q%', v_quarter_start; END IF;

      UPDATE hr_leave_allocations
      SET available_days = available_days - v_days_after, used_days = used_days + v_days_after, updated_at = now()
      WHERE employee_id = NEW.employee_id AND leave_type_id = NEW.leave_type_id
        AND year = v_year_start AND quarter = v_quarter_end;
      GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
      IF v_rows_affected = 0 THEN RAISE WARNING 'No allocation for Q%', v_quarter_end; END IF;
    END IF;

    IF (NEW.status IN ('cancelled', 'rejected')) AND OLD.status = 'approved' THEN
      UPDATE hr_leave_allocations
      SET available_days = available_days + v_days_before, used_days = GREATEST(used_days - v_days_before, 0), updated_at = now()
      WHERE employee_id = NEW.employee_id AND leave_type_id = NEW.leave_type_id
        AND year = v_year_start AND quarter = v_quarter_start;

      UPDATE hr_leave_allocations
      SET available_days = available_days + v_days_after, used_days = GREATEST(used_days - v_days_after, 0), updated_at = now()
      WHERE employee_id = NEW.employee_id AND leave_type_id = NEW.leave_type_id
        AND year = v_year_start AND quarter = v_quarter_end;
    END IF;

    RETURN NEW;
  END IF;

  -- NORMAL SAME-QUARTER
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    UPDATE hr_leave_allocations
    SET available_days = available_days - NEW.total_days, used_days = used_days + NEW.total_days, updated_at = now()
    WHERE employee_id = NEW.employee_id AND leave_type_id = NEW.leave_type_id
      AND year = v_year_start AND quarter = v_quarter_start;
    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
    IF v_rows_affected = 0 THEN
      RAISE WARNING 'No leave allocation for employee %, leave_type %, year %, quarter %',
        NEW.employee_id, NEW.leave_type_id, v_year_start, v_quarter_start;
    END IF;
  END IF;

  IF (NEW.status IN ('cancelled', 'rejected')) AND OLD.status = 'approved' THEN
    UPDATE hr_leave_allocations
    SET available_days = available_days + NEW.total_days, used_days = GREATEST(used_days - NEW.total_days, 0), updated_at = now()
    WHERE employee_id = NEW.employee_id AND leave_type_id = NEW.leave_type_id
      AND year = v_year_start AND quarter = v_quarter_start;
  END IF;

  RETURN NEW;
END;
$$;
