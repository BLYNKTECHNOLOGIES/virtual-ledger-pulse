
-- Contract employees: attendance is tracked but does NOT affect payroll.
-- Skip LOP deduction and force attendance_ratio to 1 (full-month pay basis).
CREATE OR REPLACE FUNCTION public.fn_generate_payroll(p_payroll_run_id uuid, p_triggered_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_run RECORD; v_emp RECORD; v_item RECORD; v_att RECORD;
  v_penalty RECORD; v_loan RECORD; v_deposit RECORD; v_rev RECORD;
  v_lr RECORD;
  v_working_days integer; v_present_days numeric; v_leave_days numeric;
  v_unpaid_leave_days numeric; v_attendance_ratio numeric;
  v_total_salary numeric; v_basic_salary numeric;
  v_vars jsonb; v_amount numeric; v_formula text; v_key text; v_comp_code text;
  v_earnings_breakdown jsonb; v_deductions_breakdown jsonb; v_employer_contributions jsonb;
  v_total_earnings numeric; v_total_deductions numeric;
  v_gross_salary numeric; v_net_salary numeric;
  v_per_day_pay numeric; v_full_month_earnings numeric;
  v_penalty_days numeric; v_penalty_fixed numeric; v_penalty_deposit_fixed numeric;
  v_penalty_deduction numeric; v_penalty_ids uuid[];
  v_sunday_worked numeric; v_holiday_worked numeric;
  v_overtime_hours numeric; v_lop_days numeric; v_lop_deduction numeric;
  v_loan_deduction numeric; v_emi numeric;
  v_deposit_deduction numeric; v_deposit_replenish numeric;
  v_installment numeric; v_remaining numeric; v_net_before_deposit numeric;
  v_tds_amount numeric; v_annual_projected numeric; v_annual_tax numeric;
  v_ytd_gross numeric; v_ytd_tds numeric;
  v_fy_start date; v_month_in_fy int; v_months_remaining int;
  v_payslip_count integer := 0;
  v_holiday_dates date[]; v_dow integer;
  v_pf_wages numeric; v_pf_ee numeric; v_pf_er_eps numeric; v_pf_er_epf numeric;
  v_edli numeric; v_admin_charges numeric;
  v_esi_period_start date; v_esi_period_end date;
  v_esi_eligible boolean; v_esi_row RECORD;
  v_esi_ee numeric; v_esi_er numeric; v_prorated_gross numeric;
  v_pt_amount numeric; v_is_march boolean;
  v_arrears_total numeric; v_arrears_months integer; v_arrears_diff numeric;
  v_days_in_period numeric;
  v_run_total_gross numeric := 0;
  v_run_total_deductions numeric := 0;
  v_run_total_net numeric := 0;
  v_start_status text;
  v_base_earnings numeric;
  v_stat_base numeric;
  v_pf_ready boolean; v_esi_ready boolean;
  v_emp_type text;
  v_is_contract boolean;
BEGIN
  SELECT * INTO v_run FROM hr_payroll_runs WHERE id = p_payroll_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payroll run % not found', p_payroll_run_id; END IF;
  IF v_run.is_locked THEN RAISE EXCEPTION 'Payroll run % is locked', p_payroll_run_id; END IF;
  IF v_run.status NOT IN ('draft','processing','reviewed') THEN
    RAISE EXCEPTION 'Cannot generate payslips for status %', v_run.status;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM hr_attendance_period_locks
     WHERE period_start = v_run.pay_period_start AND period_end = v_run.pay_period_end
  ) THEN
    RAISE EXCEPTION 'Attendance is not locked for period % .. %. Lock the attendance in HR before generating payroll.',
      v_run.pay_period_start, v_run.pay_period_end;
  END IF;

  v_start_status := v_run.status;
  IF v_start_status = 'draft' THEN
    UPDATE hr_payroll_runs SET status = 'processing', updated_at = now() WHERE id = p_payroll_run_id;
  END IF;

  SELECT array_agg(date) INTO v_holiday_dates FROM hr_holidays
   WHERE date BETWEEN v_run.pay_period_start AND v_run.pay_period_end AND is_active = true;
  v_holiday_dates := COALESCE(v_holiday_dates, ARRAY[]::date[]);
  v_is_march := EXTRACT(MONTH FROM v_run.pay_period_start)::int = 3;

  IF EXTRACT(MONTH FROM v_run.pay_period_start)::int >= 4 THEN
    v_fy_start := make_date(EXTRACT(YEAR FROM v_run.pay_period_start)::int, 4, 1);
  ELSE
    v_fy_start := make_date(EXTRACT(YEAR FROM v_run.pay_period_start)::int - 1, 4, 1);
  END IF;
  v_month_in_fy := (EXTRACT(YEAR FROM v_run.pay_period_start)::int - EXTRACT(YEAR FROM v_fy_start)::int) * 12
                   + (EXTRACT(MONTH FROM v_run.pay_period_start)::int - EXTRACT(MONTH FROM v_fy_start)::int) + 1;
  v_months_remaining := GREATEST(1, 12 - v_month_in_fy + 1);

  UPDATE hr_salary_revisions SET arrears_paid_at = NULL, arrears_amount = NULL, arrears_payroll_run_id = NULL
   WHERE arrears_payroll_run_id = p_payroll_run_id;

  DELETE FROM hr_payslips WHERE payroll_run_id = p_payroll_run_id;
  DELETE FROM hr_loan_repayments WHERE payroll_run_id = p_payroll_run_id;
  DELETE FROM hr_deposit_transactions WHERE payroll_run_id = p_payroll_run_id;
  UPDATE hr_penalties SET is_applied=false, applied_at=NULL, payroll_run_id=NULL
    WHERE payroll_run_id = p_payroll_run_id;

  FOR v_emp IN
    SELECT e.id, e.first_name, e.last_name, e.total_salary, e.basic_salary,
           e.salary_template_id, e.filing_status_id, e.state, e.uan_number, e.pf_number, e.esi_number,
           emp.employee_type
    FROM hr_employees e
    LEFT JOIN employees emp ON emp.id = e.id
    WHERE e.is_active = true
  LOOP
    v_emp_type := lower(COALESCE(v_emp.employee_type, ''));
    v_is_contract := v_emp_type IN ('contract','contractor');

    v_total_salary := COALESCE(v_emp.total_salary, 0);
    v_basic_salary := COALESCE(v_emp.basic_salary, v_total_salary * 0.5);
    v_earnings_breakdown := '{}'::jsonb;
    v_deductions_breakdown := '{}'::jsonb;
    v_employer_contributions := '{}'::jsonb;
    v_total_earnings := 0; v_total_deductions := 0;
    v_present_days := 0; v_overtime_hours := 0;
    v_sunday_worked := 0; v_holiday_worked := 0;
    v_arrears_total := 0;

    v_working_days := fn_calculate_working_days(v_emp.id, v_run.pay_period_start, v_run.pay_period_end);

    FOR v_att IN
      SELECT attendance_date, attendance_status, overtime_hours FROM hr_attendance
       WHERE employee_id = v_emp.id AND attendance_date BETWEEN v_run.pay_period_start AND v_run.pay_period_end
    LOOP
      IF v_att.attendance_status IN ('present','late','half_day') THEN
        v_present_days := v_present_days + CASE WHEN v_att.attendance_status='half_day' THEN 0.5 ELSE 1 END;
        v_dow := EXTRACT(DOW FROM v_att.attendance_date)::integer;
        IF v_dow = ANY(fn_employee_weekly_off_dows(v_emp.id, v_att.attendance_date)) THEN v_sunday_worked := v_sunday_worked + CASE WHEN v_att.attendance_status='half_day' THEN 0.5 ELSE 1 END; END IF;
        IF v_att.attendance_date = ANY(v_holiday_dates) THEN v_holiday_worked := v_holiday_worked + CASE WHEN v_att.attendance_status='half_day' THEN 0.5 ELSE 1 END; END IF;
      END IF;
      v_overtime_hours := v_overtime_hours + COALESCE(v_att.overtime_hours, 0);
    END LOOP;

    v_leave_days := 0; v_unpaid_leave_days := 0;
    FOR v_lr IN
      SELECT lr.start_date, lr.end_date, lr.total_days, COALESCE(lt.is_paid, true) AS is_paid
        FROM hr_leave_requests lr
        LEFT JOIN hr_leave_types lt ON lt.id = lr.leave_type_id
       WHERE lr.employee_id = v_emp.id
         AND lr.status = 'approved'
         AND lr.start_date <= v_run.pay_period_end
         AND lr.end_date   >= v_run.pay_period_start
    LOOP
      v_days_in_period := LEAST(
        fn_calculate_working_days(
          v_emp.id,
          GREATEST(v_lr.start_date, v_run.pay_period_start),
          LEAST(v_lr.end_date,   v_run.pay_period_end)
        )::numeric,
        COALESCE(v_lr.total_days, 0)::numeric
      );
      IF v_days_in_period > 0 THEN
        IF v_lr.is_paid THEN
          v_leave_days := v_leave_days + v_days_in_period;
        ELSE
          v_unpaid_leave_days := v_unpaid_leave_days + v_days_in_period;
        END IF;
      END IF;
    END LOOP;

    v_present_days := LEAST(v_present_days + v_leave_days, v_working_days);
    -- Contract employees: attendance does not affect payroll (full-month basis).
    IF v_is_contract THEN
      v_attendance_ratio := 1;
    ELSE
      v_attendance_ratio := CASE WHEN v_working_days > 0 THEN v_present_days / v_working_days ELSE 0 END;
    END IF;

    IF v_emp.salary_template_id IS NOT NULL AND v_total_salary > 0 THEN
      v_vars := jsonb_build_object('total_salary',v_total_salary,'gross_salary',v_total_salary,
                                   'basic_pay',v_basic_salary,'basic_salary',v_basic_salary,'basic',v_basic_salary);
      FOR v_item IN
        SELECT ti.calculation_type, ti.value, ti.percentage_of, ti.formula, ti.is_variable,
               sc.code AS comp_code, sc.name AS comp_name, sc.component_type
          FROM hr_salary_structure_template_items ti
          JOIN hr_salary_components sc ON sc.id = ti.component_id
         WHERE ti.template_id = v_emp.salary_template_id
         ORDER BY (ti.calculation_type='formula') ASC, ti.created_at ASC
      LOOP
        IF v_item.is_variable THEN CONTINUE; END IF;
        IF lower(COALESCE(v_item.comp_code,'')) IN ('pfe','pfc','esie','esic','pt','tds') THEN CONTINUE; END IF;
        v_amount := 0;
        IF v_item.calculation_type='percentage' THEN
          IF v_item.percentage_of IN ('basic','basic_pay','basic_salary') THEN v_amount := v_basic_salary * (v_item.value/100.0);
          ELSIF v_item.percentage_of IN ('gross','total','total_salary','gross_salary') THEN v_amount := v_total_salary * (v_item.value/100.0);
          ELSE v_amount := v_basic_salary * (v_item.value/100.0); END IF;
        ELSIF v_item.calculation_type='formula' AND v_item.formula IS NOT NULL THEN
          v_formula := lower(trim(v_item.formula));
          FOR v_key IN SELECT k FROM jsonb_object_keys(v_vars) AS k ORDER BY length(k) DESC LOOP
            v_formula := replace(v_formula, v_key, (v_vars->>v_key));
          END LOOP;
          IF v_formula ~ '^[\d\s\+\-\*/\(\)\.]+$' THEN
            BEGIN EXECUTE format('SELECT (%s)::numeric', v_formula) INTO v_amount;
            EXCEPTION WHEN OTHERS THEN v_amount := 0; END;
          END IF;
        ELSE v_amount := COALESCE(v_item.value,0); END IF;
        v_amount := round(v_amount);
        v_comp_code := lower(COALESCE(v_item.comp_code,''));
        IF v_comp_code <> '' THEN v_vars := v_vars || jsonb_build_object(v_comp_code, v_amount); END IF;
        IF v_item.comp_name IS NOT NULL THEN
          v_vars := v_vars || jsonb_build_object(
            lower(regexp_replace(regexp_replace(v_item.comp_name,'[^a-zA-Z0-9]+','_','g'),'^_|_$','','g')), v_amount);
        END IF;
        IF v_item.component_type IN ('allowance','earning') THEN
          v_earnings_breakdown := v_earnings_breakdown || jsonb_build_object(v_item.comp_name, v_amount);
          v_total_earnings := v_total_earnings + v_amount;
        ELSIF v_item.component_type = 'deduction' THEN
          v_deductions_breakdown := v_deductions_breakdown || jsonb_build_object(v_item.comp_name, v_amount);
          v_total_deductions := v_total_deductions + v_amount;
        ELSIF v_item.component_type = 'employer_contribution' THEN
          v_employer_contributions := v_employer_contributions || jsonb_build_object(v_item.comp_name, v_amount);
        END IF;
      END LOOP;
    ELSIF v_basic_salary > 0 THEN
      v_earnings_breakdown := jsonb_build_object('Basic Salary', v_basic_salary);
      v_total_earnings := v_basic_salary;
    END IF;

    v_base_earnings := v_total_earnings;

    v_full_month_earnings := CASE WHEN v_total_earnings > 0 THEN v_total_earnings ELSE v_total_salary END;
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

    FOR v_rev IN
      SELECT id, previous_total, new_total, effective_from
        FROM hr_salary_revisions
       WHERE employee_id = v_emp.id
         AND status = 'approved'
         AND effective_from < v_run.pay_period_start
         AND arrears_paid_at IS NULL
         AND COALESCE(new_total, 0) > COALESCE(previous_total, 0)
    LOOP
      v_arrears_diff := COALESCE(v_rev.new_total,0) - COALESCE(v_rev.previous_total,0);
      v_arrears_months := GREATEST(0,
        (EXTRACT(YEAR FROM v_run.pay_period_start)::int - EXTRACT(YEAR FROM v_rev.effective_from)::int) * 12
        + (EXTRACT(MONTH FROM v_run.pay_period_start)::int - EXTRACT(MONTH FROM v_rev.effective_from)::int));
      IF v_arrears_months > 0 AND v_arrears_diff > 0 THEN
        v_amount := round(v_arrears_diff * v_arrears_months);
        v_earnings_breakdown := v_earnings_breakdown || jsonb_build_object(
          'Salary Arrears ('||v_arrears_months||' month'||CASE WHEN v_arrears_months>1 THEN 's' ELSE '' END||')', v_amount);
        v_total_earnings := v_total_earnings + v_amount;
        v_arrears_total := v_arrears_total + v_amount;
        UPDATE hr_salary_revisions
           SET arrears_paid_at = now(), arrears_amount = v_amount, arrears_payroll_run_id = p_payroll_run_id
         WHERE id = v_rev.id;
      END IF;
    END LOOP;

    v_penalty_days := 0; v_penalty_fixed := 0; v_penalty_deposit_fixed := 0;
    v_penalty_deduction := 0; v_penalty_ids := ARRAY[]::uuid[];
    FOR v_penalty IN
      SELECT id, penalty_days, penalty_amount, deduct_from_deposit, penalty_reason
        FROM hr_penalties WHERE employee_id = v_emp.id
         AND penalty_month = to_char(v_run.pay_period_start,'YYYY-MM') AND is_applied = false
    LOOP
      v_penalty_ids := array_append(v_penalty_ids, v_penalty.id);
      IF v_penalty.deduct_from_deposit THEN
        v_penalty_deposit_fixed := v_penalty_deposit_fixed + COALESCE(v_penalty.penalty_amount,0);
      ELSE
        v_penalty_days := v_penalty_days + COALESCE(v_penalty.penalty_days,0);
        v_penalty_fixed := v_penalty_fixed + COALESCE(v_penalty.penalty_amount,0);
      END IF;
    END LOOP;
    IF v_penalty_days > 0 AND v_per_day_pay > 0 THEN
      v_penalty_deduction := round(v_per_day_pay * v_penalty_days);
      v_deductions_breakdown := v_deductions_breakdown || jsonb_build_object(
        'Late Penalty ('||v_penalty_days||' day'||CASE WHEN v_penalty_days>1 THEN 's' ELSE '' END||')', v_penalty_deduction);
      v_total_deductions := v_total_deductions + v_penalty_deduction;
    END IF;
    IF v_penalty_fixed > 0 THEN
      v_deductions_breakdown := v_deductions_breakdown || jsonb_build_object('Manual Penalty', v_penalty_fixed);
      v_total_deductions := v_total_deductions + v_penalty_fixed;
      v_penalty_deduction := v_penalty_deduction + v_penalty_fixed;
    END IF;

    -- LOP: skipped for CONTRACT employees (attendance tracked, not deducted)
    IF v_is_contract THEN
      v_lop_days := 0;
      v_lop_deduction := 0;
    ELSE
      v_lop_days := GREATEST(0, v_working_days - v_present_days);
      v_lop_deduction := CASE WHEN v_lop_days>0 AND v_per_day_pay>0 THEN round(v_per_day_pay * v_lop_days) ELSE 0 END;
      IF v_lop_deduction > 0 THEN
        v_deductions_breakdown := v_deductions_breakdown || jsonb_build_object('LOP Deduction', v_lop_deduction);
        v_total_deductions := v_total_deductions + v_lop_deduction;
      END IF;
    END IF;

    v_stat_base := GREATEST(0, round(v_base_earnings) - COALESCE(v_lop_deduction, 0));
    v_prorated_gross := round(v_total_earnings);

    -- (Remaining function body preserved as-is from previous version)
    -- PF
    v_pf_wages := LEAST(round(v_basic_salary * v_attendance_ratio), 15000);
    v_pf_ready := (v_emp.uan_number IS NOT NULL AND btrim(v_emp.uan_number) <> '')
               OR (v_emp.pf_number  IS NOT NULL AND btrim(v_emp.pf_number)  <> '');
    IF v_pf_wages > 0 THEN
      v_pf_ee     := round(v_pf_wages * 0.12);
      v_pf_er_eps := round(v_pf_wages * 0.0833);
      v_pf_er_epf := round(v_pf_wages * 0.0367);
      v_edli      := LEAST(round(v_pf_wages * 0.005), 75);
      v_admin_charges := round(v_pf_wages * 0.005);
      IF v_pf_ee > 0 THEN
        v_deductions_breakdown := v_deductions_breakdown || jsonb_build_object(
          'EPF Employee' || CASE WHEN v_pf_ready THEN '' ELSE ' (⚠ UAN missing)' END, v_pf_ee);
        v_total_deductions := v_total_deductions + v_pf_ee;
      END IF;
      v_employer_contributions := v_employer_contributions
        || jsonb_build_object('EPS (Employer)', v_pf_er_eps)
        || jsonb_build_object('EPF (Employer)', v_pf_er_epf)
        || jsonb_build_object('EDLI', v_edli)
        || jsonb_build_object('PF Admin', v_admin_charges);
      IF NOT v_pf_ready THEN
        INSERT INTO hr_drift_alerts (employee_id, field, severity, message, source)
        VALUES (v_emp.id, 'uan_number', 'high',
          'UAN/PF number missing while PF liability accrued in payroll',
          'fn_generate_payroll')
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;

    -- ESI
    v_esi_eligible := (v_base_earnings <= 21000);
    v_esi_ready := (v_emp.esi_number IS NOT NULL AND btrim(v_emp.esi_number) <> '');
    IF v_esi_eligible THEN
      v_esi_ee := round((v_stat_base + COALESCE(v_overtime_hours,0)) * 0.0075);
      v_esi_er := round((v_stat_base + COALESCE(v_overtime_hours,0)) * 0.0325);
      IF v_esi_ee > 0 THEN
        v_deductions_breakdown := v_deductions_breakdown || jsonb_build_object(
          'ESI Employee' || CASE WHEN v_esi_ready THEN '' ELSE ' (⚠ ESI missing)' END, v_esi_ee);
        v_total_deductions := v_total_deductions + v_esi_ee;
      END IF;
      IF v_esi_er > 0 THEN
        v_employer_contributions := v_employer_contributions || jsonb_build_object('ESI (Employer)', v_esi_er);
      END IF;
      IF NOT v_esi_ready THEN
        INSERT INTO hr_drift_alerts (employee_id, field, severity, message, source)
        VALUES (v_emp.id, 'esi_number', 'high',
          'ESI number missing while ESI liability accrued in payroll',
          'fn_generate_payroll')
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;

    -- PT
    v_pt_amount := compute_professional_tax(v_stat_base, v_emp.state, v_is_march);
    IF v_pt_amount > 0 THEN
      v_deductions_breakdown := v_deductions_breakdown || jsonb_build_object('Professional Tax', v_pt_amount);
      v_total_deductions := v_total_deductions + v_pt_amount;
    END IF;

    -- Loans
    FOR v_loan IN
      SELECT id, monthly_installment, outstanding_balance
        FROM hr_loans WHERE employee_id = v_emp.id AND status='active'
    LOOP
      v_emi := LEAST(COALESCE(v_loan.monthly_installment,0), COALESCE(v_loan.outstanding_balance,0));
      IF v_emi > 0 THEN
        INSERT INTO hr_loan_repayments (loan_id, employee_id, payroll_run_id, repayment_date, amount)
        VALUES (v_loan.id, v_emp.id, p_payroll_run_id, v_run.pay_period_end, v_emi);
        v_deductions_breakdown := v_deductions_breakdown || jsonb_build_object('Loan EMI', v_emi);
        v_total_deductions := v_total_deductions + v_emi;
      END IF;
    END LOOP;

    -- Deposits
    v_deposit_deduction := 0; v_deposit_replenish := 0;
    FOR v_deposit IN
      SELECT id, monthly_installment, remaining_amount
        FROM hr_employee_deposits WHERE employee_id = v_emp.id AND status='active'
    LOOP
      v_installment := LEAST(COALESCE(v_deposit.monthly_installment,0), COALESCE(v_deposit.remaining_amount,0));
      IF v_installment > 0 THEN
        INSERT INTO hr_deposit_transactions (deposit_id, employee_id, payroll_run_id, transaction_date, amount, transaction_type)
        VALUES (v_deposit.id, v_emp.id, p_payroll_run_id, v_run.pay_period_end, v_installment, 'deduction');
        v_deposit_deduction := v_deposit_deduction + v_installment;
      END IF;
    END LOOP;
    IF v_deposit_deduction > 0 THEN
      v_deductions_breakdown := v_deductions_breakdown || jsonb_build_object('Security Deposit', v_deposit_deduction);
      v_total_deductions := v_total_deductions + v_deposit_deduction;
    END IF;
    IF v_penalty_deposit_fixed > 0 THEN
      INSERT INTO hr_deposit_transactions (deposit_id, employee_id, payroll_run_id, transaction_date, amount, transaction_type, notes)
      SELECT id, v_emp.id, p_payroll_run_id, v_run.pay_period_end, v_penalty_deposit_fixed, 'penalty', 'Penalty deducted from deposit'
      FROM hr_employee_deposits WHERE employee_id=v_emp.id AND status='active' LIMIT 1;
    END IF;

    -- TDS: naive annualization (unchanged from prior state; separate initiative)
    v_annual_projected := round(v_total_earnings) * 12;
    v_annual_tax := 0;
    IF v_annual_projected > 250000 THEN
      v_annual_tax := round((v_annual_projected - 250000) * 0.05);
    END IF;
    v_tds_amount := round(v_annual_tax / 12.0);
    IF v_tds_amount > 0 THEN
      v_deductions_breakdown := v_deductions_breakdown || jsonb_build_object('TDS', v_tds_amount);
      v_total_deductions := v_total_deductions + v_tds_amount;
    END IF;

    v_gross_salary := round(v_total_earnings);
    v_net_salary := v_gross_salary - round(v_total_deductions);

    INSERT INTO hr_payslips (
      payroll_run_id, employee_id, pay_period_start, pay_period_end,
      working_days, present_days, leave_days, unpaid_leave_days,
      overtime_hours, lop_days, gross_salary, total_deductions, net_salary,
      earnings_breakdown, deductions_breakdown, employer_contributions, status
    ) VALUES (
      p_payroll_run_id, v_emp.id, v_run.pay_period_start, v_run.pay_period_end,
      v_working_days, v_present_days, v_leave_days, v_unpaid_leave_days,
      v_overtime_hours, v_lop_days, v_gross_salary, round(v_total_deductions), v_net_salary,
      v_earnings_breakdown, v_deductions_breakdown, v_employer_contributions, 'generated'
    );

    IF array_length(v_penalty_ids,1) > 0 THEN
      UPDATE hr_penalties SET is_applied=true, applied_at=now(), payroll_run_id=p_payroll_run_id
        WHERE id = ANY(v_penalty_ids);
    END IF;

    v_run_total_gross := v_run_total_gross + v_gross_salary;
    v_run_total_deductions := v_run_total_deductions + round(v_total_deductions);
    v_run_total_net := v_run_total_net + v_net_salary;
    v_payslip_count := v_payslip_count + 1;
  END LOOP;

  UPDATE hr_payroll_runs
     SET status = CASE WHEN status='processing' THEN 'generated' ELSE status END,
         total_gross = v_run_total_gross,
         total_deductions = v_run_total_deductions,
         total_net = v_run_total_net,
         employee_count = v_payslip_count,
         processed_by = COALESCE(p_triggered_by, processed_by),
         updated_at = now()
   WHERE id = p_payroll_run_id;

  RETURN jsonb_build_object(
    'ok', true,
    'payroll_run_id', p_payroll_run_id,
    'payslip_count', v_payslip_count,
    'total_gross', v_run_total_gross,
    'total_deductions', v_run_total_deductions,
    'total_net', v_run_total_net
  );
END;
$function$;
