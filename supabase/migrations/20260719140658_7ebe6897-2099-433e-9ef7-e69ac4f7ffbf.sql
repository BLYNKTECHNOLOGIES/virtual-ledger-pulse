
-- ============================================================
-- Path A: Structure-swap doctrine toggle + assignment tagging
-- ============================================================

-- 1. Doctrine guard on the RazorpayX settings singleton
ALTER TABLE public.hr_razorpay_settings
  ADD COLUMN IF NOT EXISTS path_a_structure_swap_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS path_a_enabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS path_a_enabled_by uuid;

COMMENT ON COLUMN public.hr_razorpay_settings.path_a_structure_swap_enabled IS
  'When true, HRMS is authorised to overwrite RazorpayX salary structures via people:set-salary (training <-> real). Off = mirror-only doctrine.';

-- 2. Tag every salary structure assignment as "training" or "real"
ALTER TABLE public.hr_employee_salary_structure_assignments
  ADD COLUMN IF NOT EXISTS structure_kind text NOT NULL DEFAULT 'real'
    CHECK (structure_kind IN ('training','real','ad_hoc'));

CREATE INDEX IF NOT EXISTS idx_hr_salary_assignments_emp_kind
  ON public.hr_employee_salary_structure_assignments (employee_id, structure_kind, pushed_at DESC);

-- 3. Track training swap lifecycle on the employee record
ALTER TABLE public.hr_employee_work_info
  ADD COLUMN IF NOT EXISTS training_structure_pushed_at timestamptz,
  ADD COLUMN IF NOT EXISTS real_structure_pushed_at timestamptz,
  ADD COLUMN IF NOT EXISTS training_swap_scheduled_for date,   -- DOJ + training_period_months
  ADD COLUMN IF NOT EXISTS real_structure_template_id uuid;    -- the "target" template for the swap

-- 4. Annotate shadow payroll runs with expected swap events so the drift comparator can tolerate them
ALTER TABLE public.hr_shadow_payroll_runs
  ADD COLUMN IF NOT EXISTS expected_swap_events jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.hr_shadow_payroll_runs.expected_swap_events IS
  'Array of {employee_id, kind:"training_to_real"|"hire_to_training", at:timestamptz} events that happened inside the run window. Drift compare treats these employees as expected-different.';

-- 5. Fix the security-deposit scheduler (previous RPC referenced non-existent columns)
CREATE OR REPLACE FUNCTION public.hr_schedule_security_deposit(p_employee_id uuid)
RETURNS TABLE(period_month date, installment_no int, amount numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_policy public.hr_offer_letter_policy;
  v_join   date;
  v_monthly_ctc numeric;
  v_deposit_total numeric;
  v_per_installment numeric;
  v_deposit_row public.hr_employee_deposits;
  v_month_offset int;
  v_period date;
  v_installment int := 0;
BEGIN
  SELECT * INTO v_policy FROM public.hr_offer_letter_policy WHERE is_singleton = true LIMIT 1;
  IF v_policy IS NULL THEN
    RAISE EXCEPTION 'hr_offer_letter_policy singleton row missing';
  END IF;

  SELECT joining_date INTO v_join
    FROM public.hr_employee_work_info WHERE employee_id = p_employee_id;
  IF v_join IS NULL THEN RETURN; END IF;

  -- Use the most recent REAL structure (not the training one) to size the deposit.
  SELECT annual_ctc / 12.0 INTO v_monthly_ctc
    FROM public.hr_employee_salary_structure_assignments
    WHERE employee_id = p_employee_id
      AND structure_kind = 'real'
      AND push_status = 'pushed'
    ORDER BY pushed_at DESC NULLS LAST, created_at DESC
    LIMIT 1;

  -- Fallback to any assignment if no "real" one exists yet
  IF v_monthly_ctc IS NULL THEN
    SELECT annual_ctc / 12.0 INTO v_monthly_ctc
      FROM public.hr_employee_salary_structure_assignments
      WHERE employee_id = p_employee_id
      ORDER BY created_at DESC LIMIT 1;
  END IF;

  IF v_monthly_ctc IS NULL OR v_monthly_ctc <= 0 THEN RETURN; END IF;

  v_deposit_total := round(v_monthly_ctc * v_policy.deposit_pct, 2);
  v_per_installment := round(v_deposit_total / GREATEST(array_length(v_policy.deposit_months,1),1), 2);

  SELECT * INTO v_deposit_row FROM public.hr_employee_deposits
    WHERE employee_id = p_employee_id LIMIT 1;
  IF v_deposit_row IS NULL THEN
    INSERT INTO public.hr_employee_deposits (
      employee_id, total_deposit_amount, deduction_mode,
      deduction_value, deduction_start_month
    ) VALUES (
      p_employee_id, v_deposit_total, 'fixed_installment',
      v_per_installment,
      to_char(date_trunc('month', v_join) + INTERVAL '1 month', 'YYYY-MM')
    ) RETURNING * INTO v_deposit_row;
  END IF;

  FOREACH v_month_offset IN ARRAY v_policy.deposit_months LOOP
    v_installment := v_installment + 1;
    v_period := (date_trunc('month', v_join) + (v_month_offset - 1) * INTERVAL '1 month')::date;
    INSERT INTO public.hr_employee_deposit_schedule (
      employee_id, deposit_id, period_month, installment_no, amount
    ) VALUES (
      p_employee_id, v_deposit_row.id, v_period, v_installment, v_per_installment
    )
    ON CONFLICT (employee_id, period_month, installment_no) DO NOTHING;

    period_month := v_period;
    installment_no := v_installment;
    amount := v_per_installment;
    RETURN NEXT;
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.hr_schedule_security_deposit(uuid) TO authenticated, service_role;

-- 6. Helper: pending training swaps (used by the daily scheduler edge fn)
CREATE OR REPLACE FUNCTION public.hr_pending_training_swaps()
RETURNS TABLE(employee_id uuid, joining_date date, training_period_months int, swap_due date, level_band text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    wi.employee_id,
    wi.joining_date,
    p.training_period_months,
    (wi.joining_date + (p.training_period_months || ' months')::interval)::date AS swap_due,
    wi.level_band
  FROM public.hr_employee_work_info wi
  CROSS JOIN LATERAL (SELECT * FROM public.hr_offer_letter_policy WHERE is_singleton = true LIMIT 1) p
  JOIN public.hr_employees e ON e.id = wi.employee_id
  WHERE wi.joining_date IS NOT NULL
    AND wi.real_structure_pushed_at IS NULL
    AND wi.training_structure_pushed_at IS NOT NULL
    AND (wi.joining_date + (p.training_period_months || ' months')::interval)::date <= CURRENT_DATE
    AND e.is_active = true
$$;

GRANT EXECUTE ON FUNCTION public.hr_pending_training_swaps() TO authenticated, service_role;
