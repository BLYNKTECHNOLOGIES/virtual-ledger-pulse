
-- 1. Deposit typing -----------------------------------------------------
ALTER TABLE public.hr_employee_deposits
  ADD COLUMN IF NOT EXISTS deposit_type text NOT NULL DEFAULT 'security',
  ADD COLUMN IF NOT EXISTS incident_date date,
  ADD COLUMN IF NOT EXISTS incident_reference text,
  ADD COLUMN IF NOT EXISTS recovery_reason text,
  ADD COLUMN IF NOT EXISTS is_recovered boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recovered_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.hr_employee_deposits
    ADD CONSTRAINT hr_employee_deposits_type_chk
    CHECK (deposit_type IN ('security','error_recovery'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.hr_employee_deposit_schedule
  ADD COLUMN IF NOT EXISTS deposit_type text NOT NULL DEFAULT 'security';
ALTER TABLE public.hr_deposit_transactions
  ADD COLUMN IF NOT EXISTS deposit_type text NOT NULL DEFAULT 'security',
  ADD COLUMN IF NOT EXISTS period_month date;

CREATE UNIQUE INDEX IF NOT EXISTS idx_deposit_schedule_deposit_period
  ON public.hr_employee_deposit_schedule (deposit_id, period_month)
  WHERE deposit_id IS NOT NULL;

-- 2. Loan repayment scheduling -----------------------------------------
ALTER TABLE public.hr_loan_repayments
  ADD COLUMN IF NOT EXISTS period_month date,
  ADD COLUMN IF NOT EXISTS installment_no integer,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'paid',
  ADD COLUMN IF NOT EXISTS razorpay_input_id text,
  ADD COLUMN IF NOT EXISTS razorpay_pushed_at timestamptz,
  ADD COLUMN IF NOT EXISTS failure_reason text;

DO $$ BEGIN
  ALTER TABLE public.hr_loan_repayments
    ADD CONSTRAINT hr_loan_repayments_status_chk
    CHECK (status IN ('scheduled','pushed','paid','failed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_loan_repayments_loan_period
  ON public.hr_loan_repayments (loan_id, period_month)
  WHERE period_month IS NOT NULL;

-- 3. Balance sync counts only PAID repayments ---------------------------
CREATE OR REPLACE FUNCTION public.fn_sync_loan_balance_on_repayment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_loan_id uuid := COALESCE(NEW.loan_id, OLD.loan_id);
  v_paid numeric;
  v_amount numeric;
  v_out numeric;
BEGIN
  SELECT amount INTO v_amount FROM hr_loans WHERE id = v_loan_id;
  IF v_amount IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
    FROM hr_loan_repayments WHERE loan_id = v_loan_id AND status = 'paid';

  v_out := GREATEST(v_amount - v_paid, 0);

  UPDATE hr_loans
     SET outstanding_balance = v_out,
         status = CASE WHEN v_out <= 0 AND status = 'active' THEN 'closed' ELSE status END,
         updated_at = now()
   WHERE id = v_loan_id;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- 4. Rebuild a deposit's installment plan --------------------------------
CREATE OR REPLACE FUNCTION public.hr_rebuild_deposit_schedule(p_deposit_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  d public.hr_employee_deposits;
  v_remaining numeric;
  v_per numeric;
  v_monthly numeric;
  v_period date;
  v_start date;
  v_no int;
  v_created int := 0;
  v_amt numeric;
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

  -- subtract installments already pushed for this deposit
  SELECT v_remaining - COALESCE(SUM(amount),0) INTO v_remaining
    FROM public.hr_employee_deposit_schedule
   WHERE deposit_id = p_deposit_id AND status = 'pushed';
  IF v_remaining IS NULL OR v_remaining <= 0 THEN RETURN 0; END IF;

  IF d.deduction_mode = 'percentage' THEN
    SELECT annual_ctc / 12.0 INTO v_monthly
      FROM public.hr_employee_salary_structure_assignments
     WHERE employee_id = d.employee_id
     ORDER BY pushed_at DESC NULLS LAST, created_at DESC LIMIT 1;
    IF v_monthly IS NULL THEN
      SELECT total_salary INTO v_monthly FROM public.hr_employees WHERE id = d.employee_id;
    END IF;
    v_per := round(COALESCE(v_monthly,0) * COALESCE(d.deduction_value,0) / 100.0, 2);
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
  -- never schedule into a closed past month before the current period
  IF v_start < date_trunc('month', CURRENT_DATE)::date THEN
    v_start := date_trunc('month', CURRENT_DATE)::date;
  END IF;

  SELECT COALESCE(MAX(installment_no), 0) INTO v_no
    FROM public.hr_employee_deposit_schedule WHERE deposit_id = p_deposit_id;

  v_period := v_start;
  WHILE v_remaining > 0 AND v_created < 120 LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.hr_employee_deposit_schedule
       WHERE deposit_id = p_deposit_id AND period_month = v_period
    ) THEN
      v_amt := LEAST(v_per, v_remaining);
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

-- 5. Record a confirmed deposit collection -------------------------------
CREATE OR REPLACE FUNCTION public.hr_apply_deposit_collection(
  p_schedule_id uuid,
  p_razorpay_input_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  s public.hr_employee_deposit_schedule;
  d public.hr_employee_deposits;
  v_collected numeric;
  v_balance numeric;
  v_full boolean;
BEGIN
  SELECT * INTO s FROM public.hr_employee_deposit_schedule WHERE id = p_schedule_id FOR UPDATE;
  IF s IS NULL OR s.status = 'pushed' THEN RETURN; END IF;

  SELECT * INTO d FROM public.hr_employee_deposits WHERE id = s.deposit_id FOR UPDATE;
  IF d IS NULL THEN RETURN; END IF;

  v_collected := COALESCE(d.collected_amount,0) + s.amount;
  v_balance   := COALESCE(d.current_balance,0) + s.amount;
  v_full      := v_collected >= COALESCE(d.total_deposit_amount,0) - 0.01;

  UPDATE public.hr_employee_deposit_schedule
     SET status = 'pushed',
         razorpay_input_id = COALESCE(p_razorpay_input_id, razorpay_input_id),
         razorpay_pushed_at = now(),
         failure_reason = NULL,
         updated_at = now()
   WHERE id = s.id;

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
         THEN 'Error recovery installment ' || s.installment_no || ' deducted via payroll'
         ELSE 'Security deposit installment ' || s.installment_no || ' deducted via payroll' END,
    CURRENT_DATE, d.deposit_type, s.period_month, p_razorpay_input_id
  );

  IF v_full THEN
    INSERT INTO public.hr_deposit_transactions
      (employee_id, deposit_id, transaction_type, amount, balance_after,
       description, transaction_date, deposit_type, period_month)
    VALUES (d.employee_id, d.id, 'completed', 0, v_balance,
            'Target reached — collection complete', CURRENT_DATE, d.deposit_type, s.period_month);
  END IF;
END;
$function$;

-- 6. Rebuild a loan's EMI schedule ---------------------------------------
CREATE OR REPLACE FUNCTION public.hr_rebuild_loan_schedule(p_loan_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  l public.hr_loans;
  v_remaining numeric;
  v_period date;
  v_no int;
  v_amt numeric;
  v_created int := 0;
BEGIN
  SELECT * INTO l FROM public.hr_loans WHERE id = p_loan_id;
  IF l IS NULL THEN RETURN 0; END IF;

  DELETE FROM public.hr_loan_repayments
   WHERE loan_id = p_loan_id AND status IN ('scheduled','failed');

  IF l.status NOT IN ('approved','active') THEN RETURN 0; END IF;
  IF COALESCE(l.emi_amount,0) <= 0 THEN RETURN 0; END IF;

  SELECT COALESCE(l.amount,0) - COALESCE(SUM(amount),0) INTO v_remaining
    FROM public.hr_loan_repayments
   WHERE loan_id = p_loan_id AND status IN ('paid','pushed');
  IF v_remaining IS NULL OR v_remaining <= 0 THEN RETURN 0; END IF;

  v_period := GREATEST(
    date_trunc('month', COALESCE(l.start_emi_date, CURRENT_DATE))::date,
    date_trunc('month', CURRENT_DATE)::date
  );

  SELECT COALESCE(MAX(installment_no), 0) INTO v_no
    FROM public.hr_loan_repayments WHERE loan_id = p_loan_id;

  WHILE v_remaining > 0 AND v_created < 120 LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.hr_loan_repayments
       WHERE loan_id = p_loan_id AND period_month = v_period
    ) THEN
      v_amt := LEAST(l.emi_amount, v_remaining);
      v_no := v_no + 1;
      INSERT INTO public.hr_loan_repayments
        (loan_id, employee_id, amount, repayment_date, repayment_type,
         period_month, installment_no, status, balance_after, notes)
      VALUES (l.id, l.employee_id, v_amt, v_period, 'emi',
              v_period, v_no, 'scheduled', 0, 'Auto-generated EMI schedule');
      v_remaining := v_remaining - v_amt;
      v_created := v_created + 1;
    END IF;
    v_period := (v_period + INTERVAL '1 month')::date;
  END LOOP;

  RETURN v_created;
END;
$function$;

-- 7. Record a confirmed loan EMI push ------------------------------------
CREATE OR REPLACE FUNCTION public.hr_apply_loan_repayment(
  p_repayment_id uuid,
  p_razorpay_input_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r public.hr_loan_repayments;
  l public.hr_loans;
  v_paid numeric;
BEGIN
  SELECT * INTO r FROM public.hr_loan_repayments WHERE id = p_repayment_id FOR UPDATE;
  IF r IS NULL OR r.status = 'paid' THEN RETURN; END IF;
  SELECT * INTO l FROM public.hr_loans WHERE id = r.loan_id;
  IF l IS NULL THEN RETURN; END IF;

  SELECT COALESCE(SUM(amount),0) INTO v_paid
    FROM public.hr_loan_repayments
   WHERE loan_id = r.loan_id AND status = 'paid' AND id <> r.id;

  UPDATE public.hr_loan_repayments
     SET status = 'paid',
         balance_after = GREATEST(COALESCE(l.amount,0) - v_paid - r.amount, 0),
         razorpay_input_id = COALESCE(p_razorpay_input_id, razorpay_input_id),
         razorpay_pushed_at = now(),
         repayment_date = CURRENT_DATE,
         failure_reason = NULL
   WHERE id = r.id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.hr_rebuild_deposit_schedule(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_apply_deposit_collection(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.hr_rebuild_loan_schedule(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_apply_loan_repayment(uuid, text) TO service_role;
