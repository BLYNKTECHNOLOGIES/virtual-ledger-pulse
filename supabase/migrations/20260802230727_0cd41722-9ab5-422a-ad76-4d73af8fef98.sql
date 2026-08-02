
-- 1) Percentage deposit recovery must be based on MONTHLY CTC
CREATE OR REPLACE FUNCTION public.hr_rebuild_deposit_schedule(p_deposit_id uuid)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  d public.hr_employee_deposits;
  v_remaining numeric; v_per numeric; v_monthly numeric; v_annual numeric;
  v_period date; v_start date; v_no int; v_created int := 0; v_amt numeric; v_guard int := 0;
BEGIN
  SELECT * INTO d FROM public.hr_employee_deposits WHERE id = p_deposit_id;
  IF d IS NULL THEN RETURN 0; END IF;

  DELETE FROM public.hr_employee_deposit_schedule
   WHERE deposit_id = p_deposit_id AND status IN ('scheduled','failed');

  IF d.is_settled OR d.is_fully_collected OR COALESCE(d.is_paused,false)
     OR d.deduction_mode = 'already_deducted' THEN
    RETURN 0;
  END IF;

  v_remaining := GREATEST(COALESCE(d.total_deposit_amount,0) - COALESCE(d.collected_amount,0), 0);
  IF v_remaining <= 0 THEN RETURN 0; END IF;

  SELECT v_remaining - COALESCE(SUM(amount),0) INTO v_remaining
    FROM public.hr_employee_deposit_schedule
   WHERE deposit_id = p_deposit_id AND status = 'pushed';
  IF v_remaining IS NULL OR v_remaining <= 0 THEN RETURN 0; END IF;

  IF d.deduction_mode IN ('percentage','percentage_ctc') THEN
    -- Annual CTC authority ladder -> monthly base
    SELECT annual_ctc INTO v_annual
      FROM public.hr_employee_salary_structure_assignments
     WHERE employee_id = d.employee_id
     ORDER BY pushed_at DESC NULLS LAST, created_at DESC LIMIT 1;
    IF COALESCE(v_annual,0) <= 0 THEN
      SELECT total_salary INTO v_annual FROM public.hr_employees WHERE id = d.employee_id;
    END IF;
    v_monthly := COALESCE(v_annual,0) / 12.0;
    v_per := round(v_monthly * COALESCE(d.deduction_value,0) / 100.0, 2);
  ELSIF d.deduction_mode = 'one_time' THEN
    v_per := v_remaining;
  ELSE
    v_per := COALESCE(d.deduction_value, 0);
  END IF;

  IF v_per <= 0 THEN RETURN 0; END IF;

  v_start := COALESCE(
    to_date(NULLIF(d.deduction_start_month,'') || '-01', 'YYYY-MM-DD'),
    date_trunc('month', CURRENT_DATE)::date
  );
  v_start := date_trunc('month', v_start)::date;

  WHILE v_start < date_trunc('month', CURRENT_DATE)::date
        AND public.hr_is_payroll_period_processed(v_start)
        AND v_guard < 60 LOOP
    v_start := (v_start + INTERVAL '1 month')::date;
    v_guard := v_guard + 1;
  END LOOP;

  SELECT COALESCE(MAX(installment_no), 0) INTO v_no
    FROM public.hr_employee_deposit_schedule WHERE deposit_id = p_deposit_id;

  v_period := v_start;
  WHILE v_remaining > 0.009 AND v_created < 120 LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.hr_employee_deposit_schedule
       WHERE deposit_id = p_deposit_id AND period_month = v_period
    ) THEN
      v_amt := round(LEAST(v_per, v_remaining), 2);
      v_no := v_no + 1;
      INSERT INTO public.hr_employee_deposit_schedule
        (employee_id, deposit_id, period_month, installment_no, amount, status, deposit_type)
      VALUES (d.employee_id, d.id, v_period, v_no, v_amt, 'scheduled', d.deposit_type)
      ON CONFLICT DO NOTHING;
      v_remaining := v_remaining - v_amt;
      v_created := v_created + 1;
    END IF;
    v_period := (v_period + INTERVAL '1 month')::date;
  END LOOP;

  RETURN v_created;
END;
$function$;

-- 2) Stop recovery when fully collected; re-trim remaining installments otherwise
CREATE OR REPLACE FUNCTION public.hr_settle_deposit_installment(p_schedule_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  s public.hr_employee_deposit_schedule;
  d public.hr_employee_deposits;
  v_collected numeric; v_balance numeric; v_full boolean;
BEGIN
  SELECT * INTO s FROM public.hr_employee_deposit_schedule WHERE id = p_schedule_id FOR UPDATE;
  IF s IS NULL OR s.status <> 'pushed' THEN RETURN; END IF;

  SELECT * INTO d FROM public.hr_employee_deposits WHERE id = s.deposit_id FOR UPDATE;
  IF d IS NULL THEN RETURN; END IF;

  v_collected := COALESCE(d.collected_amount,0) + s.amount;
  v_balance   := COALESCE(d.current_balance,0) + s.amount;
  v_full      := v_collected >= COALESCE(d.total_deposit_amount,0) - 0.01;

  UPDATE public.hr_employee_deposit_schedule
     SET status = 'collected', updated_at = now() WHERE id = s.id;

  UPDATE public.hr_employee_deposits
     SET collected_amount = v_collected,
         current_balance = v_balance,
         is_fully_collected = v_full,
         updated_at = now()
   WHERE id = d.id;

  INSERT INTO public.hr_deposit_transactions
    (employee_id, deposit_id, transaction_type, amount, balance_after,
     description, transaction_date, deposit_type, period_month, reference_id)
  VALUES (
    d.employee_id, d.id, 'collection', s.amount, v_balance,
    CASE WHEN d.deposit_type = 'error_recovery'
         THEN 'Error recovery installment ' || s.installment_no || ' collected in ' || to_char(s.period_month,'Mon YYYY') || ' payroll'
         ELSE 'Security deposit installment ' || s.installment_no || ' collected in ' || to_char(s.period_month,'Mon YYYY') || ' payroll' END,
    CURRENT_DATE, d.deposit_type, s.period_month, s.razorpay_input_id
  );

  IF v_full THEN
    -- target reached: cancel every future/unpushed installment
    DELETE FROM public.hr_employee_deposit_schedule
     WHERE deposit_id = d.id AND status IN ('scheduled','failed');

    INSERT INTO public.hr_deposit_transactions
      (employee_id, deposit_id, transaction_type, amount, balance_after,
       description, transaction_date, deposit_type, period_month)
    VALUES (d.employee_id, d.id, 'completed', 0, v_balance,
            'Target reached — collection complete', CURRENT_DATE, d.deposit_type, s.period_month);
  ELSE
    -- re-trim the remaining plan so the final installment equals the leftover balance
    PERFORM public.hr_rebuild_deposit_schedule(d.id);
  END IF;
END;
$function$;

-- 3) Loans: close automatically when fully repaid, re-trim otherwise
CREATE OR REPLACE FUNCTION public.hr_apply_loan_repayment(p_repayment_id uuid, p_razorpay_input_id text DEFAULT NULL::text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  r public.hr_loan_repayments;
  l public.hr_loans;
  v_paid numeric; v_outstanding numeric;
BEGIN
  SELECT * INTO r FROM public.hr_loan_repayments WHERE id = p_repayment_id FOR UPDATE;
  IF r IS NULL OR r.status = 'paid' THEN RETURN; END IF;
  SELECT * INTO l FROM public.hr_loans WHERE id = r.loan_id;
  IF l IS NULL THEN RETURN; END IF;

  SELECT COALESCE(SUM(amount),0) INTO v_paid
    FROM public.hr_loan_repayments
   WHERE loan_id = r.loan_id AND status = 'paid' AND id <> r.id;

  v_outstanding := GREATEST(COALESCE(l.amount,0) - v_paid - r.amount, 0);

  UPDATE public.hr_loan_repayments
     SET status = 'paid',
         balance_after = v_outstanding,
         razorpay_input_id = COALESCE(p_razorpay_input_id, razorpay_input_id),
         razorpay_pushed_at = now(),
         repayment_date = CURRENT_DATE,
         failure_reason = NULL
   WHERE id = r.id;

  IF v_outstanding <= 0.01 THEN
    DELETE FROM public.hr_loan_repayments
     WHERE loan_id = l.id AND status IN ('scheduled','failed');
    UPDATE public.hr_loans
       SET status = 'closed', outstanding_balance = 0, updated_at = now()
     WHERE id = l.id;
  ELSE
    UPDATE public.hr_loans SET outstanding_balance = v_outstanding, updated_at = now() WHERE id = l.id;
    PERFORM public.hr_rebuild_loan_schedule(l.id);
  END IF;
END;
$function$;

-- 4) Expose progress context on the auto-recovery view
DROP VIEW IF EXISTS public.hr_payroll_auto_recoveries;
CREATE VIEW public.hr_payroll_auto_recoveries
WITH (security_invoker = true) AS
 SELECT r.id,
    'loan'::text AS source_kind,
    r.loan_id AS parent_id,
    r.employee_id,
    e.badge_id,
    btrim((COALESCE(e.first_name, ''::text) || ' '::text) || COALESCE(e.last_name, ''::text)) AS employee_name,
    r.period_month,
    r.installment_no,
    r.amount,
    r.status,
    r.razorpay_input_id,
    r.razorpay_pushed_at,
    r.failure_reason,
    CASE WHEN COALESCE(l.loan_type, ''::text) ~~ '%advance%'::text THEN 'Salary advance recovery'::text
         ELSE 'Loan EMI'::text END AS label,
    'LOAN_EMI_M'::text || r.installment_no AS razorpay_code,
    COALESCE(l.amount,0) AS total_amount,
    COALESCE(l.amount,0) - COALESCE(l.outstanding_balance, COALESCE(l.amount,0)) AS collected_amount,
    (SELECT count(*) FROM public.hr_loan_repayments x WHERE x.loan_id = l.id) AS total_installments,
    (SELECT COALESCE(SUM(x.amount),0) FROM public.hr_loan_repayments x
      WHERE x.loan_id = l.id AND x.status IN ('scheduled','failed','pushed')
        AND x.period_month > r.period_month) AS remaining_after
   FROM hr_loan_repayments r
     JOIN hr_loans l ON l.id = r.loan_id
     LEFT JOIN hr_employees e ON e.id = r.employee_id
UNION ALL
 SELECT s.id,
    'deposit'::text AS source_kind,
    s.deposit_id AS parent_id,
    s.employee_id,
    e.badge_id,
    btrim((COALESCE(e.first_name, ''::text) || ' '::text) || COALESCE(e.last_name, ''::text)) AS employee_name,
    s.period_month,
    s.installment_no,
    s.amount,
    s.status,
    s.razorpay_input_id,
    s.razorpay_pushed_at,
    s.failure_reason,
    CASE WHEN s.deposit_type = 'error_recovery'::text THEN 'Error recovery'::text
         ELSE 'Security deposit'::text END AS label,
    CASE WHEN s.deposit_type = 'error_recovery'::text THEN 'ERROR_RECOVERY_M'::text
         ELSE 'SECURITY_DEPOSIT_M'::text END || s.installment_no AS razorpay_code,
    COALESCE(d.total_deposit_amount,0) AS total_amount,
    COALESCE(d.collected_amount,0) AS collected_amount,
    (SELECT count(*) FROM public.hr_employee_deposit_schedule x WHERE x.deposit_id = d.id) AS total_installments,
    (SELECT COALESCE(SUM(x.amount),0) FROM public.hr_employee_deposit_schedule x
      WHERE x.deposit_id = d.id AND x.status IN ('scheduled','failed','pushed')
        AND x.period_month > s.period_month) AS remaining_after
   FROM hr_employee_deposit_schedule s
     JOIN hr_employee_deposits d ON d.id = s.deposit_id
     LEFT JOIN hr_employees e ON e.id = s.employee_id;

GRANT SELECT ON public.hr_payroll_auto_recoveries TO authenticated;
GRANT ALL ON public.hr_payroll_auto_recoveries TO service_role;

-- 5) Rebuild every open deposit schedule with the corrected percentage base
DO $$
DECLARE x record;
BEGIN
  FOR x IN SELECT id FROM public.hr_employee_deposits
            WHERE COALESCE(is_settled,false) = false
              AND COALESCE(is_fully_collected,false) = false
              AND deduction_mode <> 'already_deducted' LOOP
    PERFORM public.hr_rebuild_deposit_schedule(x.id);
  END LOOP;
END $$;
