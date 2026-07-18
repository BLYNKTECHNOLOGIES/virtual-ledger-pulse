
-- ============================================================
-- 1. RLS HARDENING (Claim 5)
-- ============================================================
DROP POLICY IF EXISTS authenticated_all_hr_payslips ON public.hr_payslips;
DROP POLICY IF EXISTS authenticated_all_hr_employees ON public.hr_employees;
DROP POLICY IF EXISTS authenticated_all_hr_employee_salary_structures ON public.hr_employee_salary_structures;
DROP POLICY IF EXISTS authenticated_all_hr_penalties ON public.hr_penalties;

-- hr_payslips
CREATE POLICY "HR admins manage payslips" ON public.hr_payslips
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'))
  WITH CHECK (public.has_role(auth.uid(),'super admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'));
CREATE POLICY "Employees view own payslip" ON public.hr_payslips
  FOR SELECT TO authenticated
  USING (employee_id IN (SELECT id FROM public.hr_employees WHERE user_id = auth.uid()));

-- hr_employees
CREATE POLICY "HR admins manage employees" ON public.hr_employees
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'))
  WITH CHECK (public.has_role(auth.uid(),'super admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'));
CREATE POLICY "Employees view own record" ON public.hr_employees
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- hr_employee_salary_structures
CREATE POLICY "HR admins manage salary structures" ON public.hr_employee_salary_structures
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'))
  WITH CHECK (public.has_role(auth.uid(),'super admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'));
CREATE POLICY "Employees view own salary structure" ON public.hr_employee_salary_structures
  FOR SELECT TO authenticated
  USING (employee_id IN (SELECT id FROM public.hr_employees WHERE user_id = auth.uid()));

-- hr_penalties
CREATE POLICY "HR admins manage penalties" ON public.hr_penalties
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'))
  WITH CHECK (public.has_role(auth.uid(),'super admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'));
CREATE POLICY "Employees view own penalties" ON public.hr_penalties
  FOR SELECT TO authenticated
  USING (employee_id IN (SELECT id FROM public.hr_employees WHERE user_id = auth.uid()));

-- ============================================================
-- 2. FILING STATUS: regime + statutory config (Claim 7)
-- ============================================================
ALTER TABLE public.hr_filing_statuses
  ADD COLUMN IF NOT EXISTS regime_type text CHECK (regime_type IN ('old','new')),
  ADD COLUMN IF NOT EXISTS standard_deduction numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cess_rate numeric NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS rebate_87a_limit numeric NOT NULL DEFAULT 0;

UPDATE public.hr_filing_statuses SET
  regime_type = CASE WHEN name ILIKE '%new%' THEN 'new' WHEN name ILIKE '%old%' THEN 'old' ELSE regime_type END,
  standard_deduction = CASE WHEN name ILIKE '%new%' THEN 75000 WHEN name ILIKE '%old%' THEN 50000 ELSE standard_deduction END,
  rebate_87a_limit = CASE WHEN name ILIKE '%new%' THEN 1200000 WHEN name ILIKE '%old%' THEN 500000 ELSE rebate_87a_limit END
WHERE regime_type IS NULL OR standard_deduction = 0;

-- ============================================================
-- 3. PROFESSIONAL TAX SLABS (Claim 8)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.hr_pt_slabs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state text NOT NULL,
  min_monthly_gross numeric NOT NULL,
  max_monthly_gross numeric,
  monthly_amount numeric NOT NULL DEFAULT 0,
  march_amount numeric,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.hr_pt_slabs TO authenticated;
GRANT ALL ON public.hr_pt_slabs TO service_role;
ALTER TABLE public.hr_pt_slabs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "PT slabs readable" ON public.hr_pt_slabs FOR SELECT TO authenticated USING (true);
CREATE POLICY "PT slabs admin write" ON public.hr_pt_slabs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'))
  WITH CHECK (public.has_role(auth.uid(),'super admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'));

-- MP defaults (₹2,500/year cap; March adjustment)
INSERT INTO public.hr_pt_slabs(state,min_monthly_gross,max_monthly_gross,monthly_amount,march_amount) VALUES
  ('MP', 0,       18750,    0,   0),
  ('MP', 18750,   25000,    125, 125),
  ('MP', 25000,   33333,    167, 167),
  ('MP', 33333,   NULL,     208, 212)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.compute_professional_tax(p_state text, p_monthly_gross numeric, p_is_march boolean)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_amt numeric := 0;
BEGIN
  IF p_monthly_gross IS NULL OR p_monthly_gross <= 0 THEN RETURN 0; END IF;
  SELECT CASE WHEN p_is_march THEN COALESCE(march_amount, monthly_amount) ELSE monthly_amount END
    INTO v_amt
  FROM public.hr_pt_slabs
  WHERE is_active = true
    AND state = COALESCE(NULLIF(p_state,''),'MP')
    AND p_monthly_gross > min_monthly_gross
    AND (max_monthly_gross IS NULL OR p_monthly_gross <= max_monthly_gross)
  ORDER BY min_monthly_gross DESC LIMIT 1;
  RETURN COALESCE(v_amt, 0);
END $$;

-- ============================================================
-- 4. ESI CONTRIBUTION PERIOD STICKINESS (Claim 9)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.hr_esi_contribution_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  is_eligible boolean NOT NULL,
  initial_gross numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id, period_start)
);
GRANT SELECT, INSERT, UPDATE ON public.hr_esi_contribution_periods TO authenticated;
GRANT ALL ON public.hr_esi_contribution_periods TO service_role;
ALTER TABLE public.hr_esi_contribution_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ESI periods HR" ON public.hr_esi_contribution_periods FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'))
  WITH CHECK (public.has_role(auth.uid(),'super admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'));

-- ============================================================
-- 5. NEW TDS ENGINE (Claim 7)
-- ============================================================
CREATE OR REPLACE FUNCTION public.compute_annual_tax(p_taxable_income numeric, p_filing_status_id uuid)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_fs RECORD;
  v_bracket RECORD;
  v_taxable numeric;
  v_slab numeric;
  v_tax numeric := 0;
  v_surcharge numeric := 0;
  v_rebate_limit numeric;
  v_income_at_limit_tax numeric;
  v_marginal_income numeric;
BEGIN
  IF p_taxable_income <= 0 OR p_filing_status_id IS NULL THEN RETURN 0; END IF;

  SELECT * INTO v_fs FROM public.hr_filing_statuses WHERE id = p_filing_status_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  v_taxable := GREATEST(0, p_taxable_income - COALESCE(v_fs.standard_deduction, 0));

  -- Progressive brackets
  FOR v_bracket IN
    SELECT min_income, COALESCE(max_income, 999999999999) AS max_income, tax_rate
    FROM public.hr_tax_brackets
    WHERE filing_status_id = p_filing_status_id
    ORDER BY sort_order
  LOOP
    IF v_taxable > v_bracket.min_income THEN
      v_slab := LEAST(v_taxable, v_bracket.max_income) - v_bracket.min_income;
      v_tax := v_tax + (v_slab * v_bracket.tax_rate / 100);
    END IF;
  END LOOP;

  -- 87A rebate with MARGINAL RELIEF (new regime): if taxable <= limit, tax=0.
  -- Above the limit, tax cannot exceed (taxable - limit) to smooth the cliff.
  v_rebate_limit := COALESCE(v_fs.rebate_87a_limit, 0);
  IF v_rebate_limit > 0 AND v_fs.regime_type = 'new' THEN
    IF v_taxable <= v_rebate_limit THEN
      v_tax := 0;
    ELSE
      v_marginal_income := v_taxable - v_rebate_limit;
      IF v_tax > v_marginal_income THEN v_tax := v_marginal_income; END IF;
    END IF;
  ELSIF v_rebate_limit > 0 AND v_taxable <= v_rebate_limit THEN
    v_tax := 0;
  END IF;

  -- Surcharge with marginal relief at each threshold
  IF v_taxable > 50000000 THEN
    v_surcharge := v_tax * (CASE WHEN v_fs.regime_type='new' THEN 25 ELSE 37 END) / 100;
  ELSIF v_taxable > 20000000 THEN
    v_surcharge := v_tax * 25 / 100;
  ELSIF v_taxable > 10000000 THEN
    v_surcharge := v_tax * 15 / 100;
  ELSIF v_taxable > 5000000 THEN
    v_surcharge := v_tax * 10 / 100;
  END IF;
  v_tax := v_tax + v_surcharge;

  -- Cess
  v_tax := v_tax * (1 + COALESCE(v_fs.cess_rate,4)/100);

  RETURN ROUND(v_tax, 2);
END $$;

-- ============================================================
-- 6. FULL PAYROLL ENGINE (Claims 6,9,10 + statutory proration)
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_generate_payroll(p_payroll_run_id uuid, p_triggered_by uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_run RECORD; v_emp RECORD; v_item RECORD; v_att RECORD;
  v_penalty RECORD; v_loan RECORD; v_deposit RECORD; v_dep_txn RECORD;
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
  v_tds_amount numeric; v_annual_gross numeric; v_tax_result numeric;
  v_payslip_count integer := 0;
  v_holiday_dates date[]; v_dow integer;
  -- Statutory
  v_pf_wages numeric; v_pf_ee numeric; v_pf_er_eps numeric; v_pf_er_epf numeric;
  v_edli numeric; v_admin_charges numeric;
  v_esi_period_start date; v_esi_period_end date;
  v_esi_eligible boolean; v_esi_row RECORD;
  v_esi_ee numeric; v_esi_er numeric; v_prorated_gross numeric;
  v_pt_amount numeric; v_is_march boolean;
  v_fs RECORD;
BEGIN
  SELECT * INTO v_run FROM hr_payroll_runs WHERE id = p_payroll_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payroll run % not found', p_payroll_run_id; END IF;
  IF v_run.is_locked THEN RAISE EXCEPTION 'Payroll run % is locked', p_payroll_run_id; END IF;
  IF v_run.status NOT IN ('draft','processing','reviewed') THEN
    RAISE EXCEPTION 'Cannot generate payslips for status %', v_run.status;
  END IF;

  SELECT array_agg(date) INTO v_holiday_dates FROM hr_holidays
   WHERE date BETWEEN v_run.pay_period_start AND v_run.pay_period_end AND is_active = true;
  v_holiday_dates := COALESCE(v_holiday_dates, ARRAY[]::date[]);
  v_is_march := EXTRACT(MONTH FROM v_run.pay_period_start)::int = 3;

  -- Idempotency reversals
  UPDATE hr_loans l
     SET outstanding_balance = l.outstanding_balance + r.total_repaid,
         status = CASE WHEN l.status='closed' THEN 'active' ELSE l.status END,
         updated_at = now()
    FROM (SELECT loan_id, SUM(amount) total_repaid FROM hr_loan_repayments
           WHERE payroll_run_id = p_payroll_run_id GROUP BY loan_id) r
   WHERE l.id = r.loan_id;

  FOR v_dep_txn IN SELECT deposit_id, transaction_type, amount FROM hr_deposit_transactions
                    WHERE payroll_run_id = p_payroll_run_id LOOP
    IF v_dep_txn.transaction_type='collection' THEN
      UPDATE hr_employee_deposits SET
        collected_amount = GREATEST(0, collected_amount - v_dep_txn.amount),
        current_balance = GREATEST(0, current_balance - v_dep_txn.amount),
        is_fully_collected = CASE WHEN (collected_amount - v_dep_txn.amount) < total_deposit_amount THEN false ELSE is_fully_collected END,
        updated_at = now() WHERE id = v_dep_txn.deposit_id;
    ELSIF v_dep_txn.transaction_type='replenishment' THEN
      UPDATE hr_employee_deposits SET current_balance = GREATEST(0, current_balance - v_dep_txn.amount), updated_at = now() WHERE id = v_dep_txn.deposit_id;
    ELSIF v_dep_txn.transaction_type='penalty_deduction' THEN
      UPDATE hr_employee_deposits SET current_balance = current_balance - v_dep_txn.amount, updated_at = now() WHERE id = v_dep_txn.deposit_id;
    END IF;
  END LOOP;

  DELETE FROM hr_payslips WHERE payroll_run_id = p_payroll_run_id;
  DELETE FROM hr_loan_repayments WHERE payroll_run_id = p_payroll_run_id;
  DELETE FROM hr_deposit_transactions WHERE payroll_run_id = p_payroll_run_id;
  UPDATE hr_penalties SET is_applied=false, applied_at=NULL, payroll_run_id=NULL
    WHERE payroll_run_id = p_payroll_run_id;

  FOR v_emp IN
    SELECT id, first_name, last_name, total_salary, basic_salary,
           salary_template_id, filing_status_id, state, uan_number, pf_number, esi_number
    FROM hr_employees WHERE is_active = true
  LOOP
    v_total_salary := COALESCE(v_emp.total_salary, 0);
    v_basic_salary := COALESCE(v_emp.basic_salary, v_total_salary * 0.5);
    v_earnings_breakdown := '{}'::jsonb;
    v_deductions_breakdown := '{}'::jsonb;
    v_employer_contributions := '{}'::jsonb;
    v_total_earnings := 0; v_total_deductions := 0;
    v_present_days := 0; v_overtime_hours := 0;
    v_sunday_worked := 0; v_holiday_worked := 0;

    v_working_days := fn_calculate_working_days(v_emp.id, v_run.pay_period_start, v_run.pay_period_end);

    FOR v_att IN
      SELECT attendance_date, attendance_status, overtime_hours FROM hr_attendance
       WHERE employee_id = v_emp.id AND attendance_date BETWEEN v_run.pay_period_start AND v_run.pay_period_end
    LOOP
      IF v_att.attendance_status IN ('present','late','half_day') THEN
        v_present_days := v_present_days + CASE WHEN v_att.attendance_status='half_day' THEN 0.5 ELSE 1 END;
        v_dow := EXTRACT(DOW FROM v_att.attendance_date)::integer;
        IF v_dow = 0 THEN v_sunday_worked := v_sunday_worked + CASE WHEN v_att.attendance_status='half_day' THEN 0.5 ELSE 1 END; END IF;
        IF v_att.attendance_date = ANY(v_holiday_dates) THEN v_holiday_worked := v_holiday_worked + CASE WHEN v_att.attendance_status='half_day' THEN 0.5 ELSE 1 END; END IF;
      END IF;
      v_overtime_hours := v_overtime_hours + COALESCE(v_att.overtime_hours, 0);
    END LOOP;

    v_leave_days := 0; v_unpaid_leave_days := 0;
    SELECT
      COALESCE(SUM(CASE WHEN COALESCE(lt.is_paid,true) THEN
        (LEAST(lr.end_date, v_run.pay_period_end) - GREATEST(lr.start_date, v_run.pay_period_start) + 1)::numeric
        * (lr.total_days / NULLIF((lr.end_date - lr.start_date + 1)::numeric, 0)) ELSE 0 END),0),
      COALESCE(SUM(CASE WHEN COALESCE(lt.is_paid,true) = false THEN
        (LEAST(lr.end_date, v_run.pay_period_end) - GREATEST(lr.start_date, v_run.pay_period_start) + 1)::numeric
        * (lr.total_days / NULLIF((lr.end_date - lr.start_date + 1)::numeric, 0)) ELSE 0 END),0)
    INTO v_leave_days, v_unpaid_leave_days
    FROM hr_leave_requests lr
    LEFT JOIN hr_leave_types lt ON lt.id = lr.leave_type_id
    WHERE lr.employee_id = v_emp.id AND lr.status='approved'
      AND lr.start_date <= v_run.pay_period_end AND lr.end_date >= v_run.pay_period_start;

    IF v_present_days = 0 AND v_leave_days = 0 AND v_unpaid_leave_days = 0 THEN
      IF NOT EXISTS (SELECT 1 FROM hr_attendance
                      WHERE employee_id = v_emp.id
                        AND attendance_date BETWEEN v_run.pay_period_start AND v_run.pay_period_end) THEN
        v_present_days := v_working_days;
      END IF;
    ELSE
      v_present_days := LEAST(v_present_days + v_leave_days, v_working_days);
    END IF;

    v_attendance_ratio := CASE WHEN v_working_days > 0 THEN v_present_days / v_working_days ELSE 1 END;

    -- Template-driven earnings/deductions (skip statutory codes; central engine below owns them)
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
        -- Skip statutory codes; computed centrally below
        IF lower(COALESCE(v_item.comp_code,'')) IN ('pfe','pfc','esie','esic','pt','tds') THEN CONTINUE; END IF;
        v_amount := 0;
        IF v_item.calculation_type='percentage' THEN
          IF v_item.percentage_of IN ('basic','basic_pay','basic_salary') THEN
            v_amount := v_basic_salary * (v_item.value/100.0);
          ELSIF v_item.percentage_of IN ('gross','total','total_salary','gross_salary') THEN
            v_amount := v_total_salary * (v_item.value/100.0);
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
          -- FIX (Claim 6): employer contributions no longer vanish
          v_employer_contributions := v_employer_contributions || jsonb_build_object(v_item.comp_name, v_amount);
        END IF;
      END LOOP;
    ELSIF v_basic_salary > 0 THEN
      v_earnings_breakdown := jsonb_build_object('Basic Salary', v_basic_salary);
      v_total_earnings := v_basic_salary;
    END IF;

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

    -- Penalties (unchanged)
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

    v_lop_days := GREATEST(0, v_working_days - v_present_days);
    v_lop_deduction := CASE WHEN v_lop_days>0 AND v_per_day_pay>0 THEN round(v_per_day_pay * v_lop_days) ELSE 0 END;
    IF v_lop_deduction > 0 THEN
      v_deductions_breakdown := v_deductions_breakdown || jsonb_build_object('LOP Deduction', v_lop_deduction);
      v_total_deductions := v_total_deductions + v_lop_deduction;
    END IF;

    -- ============ STATUTORY (Claims 8,9,10) ============
    -- Prorated gross for statutory
    v_prorated_gross := round(v_total_earnings);

    -- PF (Claim 10): EPF wages = min(basic * ratio, 15000)
    IF v_emp.uan_number IS NOT NULL OR v_emp.pf_number IS NOT NULL THEN
      v_pf_wages := LEAST(round(v_basic_salary * v_attendance_ratio), 15000);
      v_pf_ee := round(v_pf_wages * 0.12);
      v_pf_er_eps := round(v_pf_wages * 0.0833);
      v_pf_er_epf := round(v_pf_wages * 0.0367);
      v_edli := LEAST(round(v_pf_wages * 0.005), 75);
      v_admin_charges := GREATEST(500, round(v_pf_wages * 0.005));
      IF v_pf_ee > 0 THEN
        v_deductions_breakdown := v_deductions_breakdown || jsonb_build_object('EPF Employee', v_pf_ee);
        v_total_deductions := v_total_deductions + v_pf_ee;
      END IF;
      v_employer_contributions := v_employer_contributions || jsonb_build_object(
        'EPF Employer', v_pf_er_epf, 'EPS Employer', v_pf_er_eps,
        'EDLI', v_edli, 'PF Admin Charges', v_admin_charges);
    END IF;

    -- ESI (Claim 9): sticky per contribution period
    -- Contribution periods: Apr–Sep, Oct–Mar
    IF EXTRACT(MONTH FROM v_run.pay_period_start)::int BETWEEN 4 AND 9 THEN
      v_esi_period_start := make_date(EXTRACT(YEAR FROM v_run.pay_period_start)::int, 4, 1);
      v_esi_period_end   := make_date(EXTRACT(YEAR FROM v_run.pay_period_start)::int, 9, 30);
    ELSIF EXTRACT(MONTH FROM v_run.pay_period_start)::int >= 10 THEN
      v_esi_period_start := make_date(EXTRACT(YEAR FROM v_run.pay_period_start)::int,10, 1);
      v_esi_period_end   := make_date(EXTRACT(YEAR FROM v_run.pay_period_start)::int + 1, 3, 31);
    ELSE
      v_esi_period_start := make_date(EXTRACT(YEAR FROM v_run.pay_period_start)::int - 1,10, 1);
      v_esi_period_end   := make_date(EXTRACT(YEAR FROM v_run.pay_period_start)::int, 3, 31);
    END IF;

    SELECT * INTO v_esi_row FROM hr_esi_contribution_periods
      WHERE employee_id = v_emp.id AND period_start = v_esi_period_start;
    IF NOT FOUND THEN
      v_esi_eligible := (v_total_earnings <= 21000);
      INSERT INTO hr_esi_contribution_periods(employee_id, period_start, period_end, is_eligible, initial_gross)
      VALUES (v_emp.id, v_esi_period_start, v_esi_period_end, v_esi_eligible, v_total_earnings)
      ON CONFLICT (employee_id, period_start) DO NOTHING;
    ELSE
      v_esi_eligible := v_esi_row.is_eligible;
    END IF;

    IF v_esi_eligible AND v_emp.esi_number IS NOT NULL THEN
      v_esi_ee := round(v_prorated_gross * 0.0075);
      v_esi_er := round(v_prorated_gross * 0.0325);
      IF v_esi_ee > 0 THEN
        v_deductions_breakdown := v_deductions_breakdown || jsonb_build_object('ESI Employee', v_esi_ee);
        v_total_deductions := v_total_deductions + v_esi_ee;
      END IF;
      v_employer_contributions := v_employer_contributions || jsonb_build_object('ESI Employer', v_esi_er);
    END IF;

    -- Professional Tax (Claim 8)
    v_pt_amount := compute_professional_tax(COALESCE(v_emp.state,'MP'), v_prorated_gross, v_is_march);
    IF v_pt_amount > 0 THEN
      v_deductions_breakdown := v_deductions_breakdown || jsonb_build_object('Professional Tax', v_pt_amount);
      v_total_deductions := v_total_deductions + v_pt_amount;
    END IF;

    -- TDS (Claim 7) — annualized current month; new compute_annual_tax applies std deduction/cess/surcharge/87A w/ marginal relief
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
      EXCEPTION WHEN OTHERS THEN v_tds_amount := 0; END;
    END IF;

    -- Loans
    v_loan_deduction := 0;
    FOR v_loan IN SELECT id, loan_type, emi_amount, outstanding_balance FROM hr_loans
                   WHERE employee_id = v_emp.id AND status='active' AND outstanding_balance > 0
    LOOP
      v_emi := LEAST(v_loan.emi_amount, v_loan.outstanding_balance);
      IF v_emi > 0 THEN
        v_loan_deduction := v_loan_deduction + v_emi;
        v_deductions_breakdown := v_deductions_breakdown || jsonb_build_object(
          'Loan EMI ('||replace(COALESCE(v_loan.loan_type,'loan'),'_',' ')||')', v_emi);
        INSERT INTO hr_loan_repayments(loan_id, employee_id, amount, repayment_date, repayment_type, payroll_run_id, balance_after)
        VALUES (v_loan.id, v_emp.id, v_emi, v_run.pay_period_end, 'payroll', p_payroll_run_id, v_loan.outstanding_balance - v_emi);
        UPDATE hr_loans SET outstanding_balance = outstanding_balance - v_emi, updated_at = now() WHERE id = v_loan.id;
        IF v_loan.outstanding_balance - v_emi <= 0 THEN
          UPDATE hr_loans SET status='closed', updated_at=now() WHERE id = v_loan.id;
        END IF;
      END IF;
    END LOOP;
    v_total_deductions := v_total_deductions + v_loan_deduction;

    -- Deposits
    v_deposit_deduction := 0; v_deposit_replenish := 0;
    v_gross_salary := v_total_earnings;
    FOR v_deposit IN
      SELECT id, total_deposit_amount, collected_amount, current_balance,
             deduction_mode, deduction_value, is_fully_collected, is_paused
        FROM hr_employee_deposits
       WHERE employee_id = v_emp.id AND is_settled = false AND (is_paused IS NULL OR is_paused = false)
    LOOP
      IF v_penalty_deposit_fixed > 0 AND v_deposit.current_balance > 0 THEN
        v_amount := LEAST(v_penalty_deposit_fixed, v_deposit.current_balance);
        v_deposit.current_balance := v_deposit.current_balance - v_amount;
        INSERT INTO hr_deposit_transactions(employee_id, deposit_id, transaction_type, amount, balance_after, description, transaction_date, payroll_run_id)
        VALUES (v_emp.id, v_deposit.id, 'penalty_deduction', -v_amount, v_deposit.current_balance, 'Penalty deducted from deposit', v_run.pay_period_end, p_payroll_run_id);
        v_penalty_deposit_fixed := v_penalty_deposit_fixed - v_amount;
      END IF;
      IF NOT v_deposit.is_fully_collected THEN
        v_remaining := v_deposit.total_deposit_amount - v_deposit.collected_amount;
        IF v_remaining > 0 THEN
          IF v_deposit.deduction_mode='one_time' THEN v_installment := v_remaining;
          ELSIF v_deposit.deduction_mode='percentage' THEN v_installment := round((v_deposit.deduction_value/100) * v_gross_salary);
          ELSE v_installment := v_deposit.deduction_value; END IF;
          v_installment := LEAST(v_installment, v_remaining);
          v_net_before_deposit := v_total_earnings - v_total_deductions;
          IF v_net_before_deposit <= 0 THEN v_installment := 0;
          ELSE v_installment := LEAST(v_installment, v_net_before_deposit); END IF;
          IF v_installment > 0 THEN
            v_deposit_deduction := v_deposit_deduction + v_installment;
            v_deductions_breakdown := v_deductions_breakdown || jsonb_build_object('Security Deposit', v_installment);
            v_total_deductions := v_total_deductions + v_installment;
            v_deposit.collected_amount := v_deposit.collected_amount + v_installment;
            v_deposit.current_balance := v_deposit.current_balance + v_installment;
            INSERT INTO hr_deposit_transactions(employee_id, deposit_id, transaction_type, amount, balance_after, description, transaction_date, payroll_run_id)
            VALUES (v_emp.id, v_deposit.id, 'collection', v_installment, v_deposit.current_balance, 'Deposit collection via payroll', v_run.pay_period_end, p_payroll_run_id);
            IF v_deposit.collected_amount >= v_deposit.total_deposit_amount THEN
              v_deposit.is_fully_collected := true;
              INSERT INTO hr_deposit_transactions(employee_id, deposit_id, transaction_type, amount, balance_after, description, transaction_date, payroll_run_id)
              VALUES (v_emp.id, v_deposit.id, 'completed', 0, v_deposit.current_balance, 'Deposit fully collected', v_run.pay_period_end, p_payroll_run_id);
            END IF;
          END IF;
        END IF;
      END IF;
      IF v_deposit.is_fully_collected AND v_deposit.current_balance < v_deposit.collected_amount THEN
        v_remaining := v_deposit.collected_amount - v_deposit.current_balance;
        IF v_deposit.deduction_mode='percentage' THEN v_amount := round((v_deposit.deduction_value/100) * v_gross_salary);
        ELSE v_amount := v_deposit.deduction_value; END IF;
        v_amount := LEAST(v_amount, v_remaining);
        IF v_amount > 0 THEN
          v_deposit_replenish := v_deposit_replenish + v_amount;
          v_deductions_breakdown := v_deductions_breakdown || jsonb_build_object('Deposit Replenishment', v_amount);
          v_total_deductions := v_total_deductions + v_amount;
          v_deposit.current_balance := v_deposit.current_balance + v_amount;
          INSERT INTO hr_deposit_transactions(employee_id, deposit_id, transaction_type, amount, balance_after, description, transaction_date, payroll_run_id)
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

    INSERT INTO hr_payslips(
      payroll_run_id, employee_id, gross_salary, total_earnings, total_deductions,
      net_salary, earnings_breakdown, deductions_breakdown, working_days, present_days,
      leave_days, lop_days, lop_deduction, overtime_hours, sunday_days_worked,
      holiday_days_worked, penalty_amount, tds_amount, status, employer_contributions
    ) VALUES (
      p_payroll_run_id, v_emp.id, v_total_earnings, v_total_earnings, v_total_deductions,
      v_net_salary, v_earnings_breakdown, v_deductions_breakdown, v_working_days, v_present_days,
      v_leave_days, v_lop_days, v_lop_deduction, v_overtime_hours, v_sunday_worked,
      v_holiday_worked, v_penalty_deduction, v_tds_amount, 'generated', v_employer_contributions
    );

    IF array_length(v_penalty_ids,1) > 0 THEN
      UPDATE hr_penalties SET is_applied=true, applied_at=now(), payroll_run_id=p_payroll_run_id
        WHERE id = ANY(v_penalty_ids);
    END IF;

    v_payslip_count := v_payslip_count + 1;
  END LOOP;

  UPDATE hr_payroll_runs SET status='reviewed', updated_at=now() WHERE id = p_payroll_run_id;
  RETURN jsonb_build_object('payslips_generated', v_payslip_count);
END $function$;
