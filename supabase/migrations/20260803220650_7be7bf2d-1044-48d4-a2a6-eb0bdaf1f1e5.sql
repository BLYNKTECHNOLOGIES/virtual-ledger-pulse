-- 1) Loan schedule: honour past start months that are not yet processed
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
  v_guard int := 0;
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

  v_period := date_trunc('month', COALESCE(l.start_emi_date, CURRENT_DATE))::date;

  -- Skip forward only over months whose payroll is already processed/locked.
  WHILE v_period < date_trunc('month', CURRENT_DATE)::date
        AND public.hr_is_payroll_period_processed(v_period)
        AND v_guard < 60 LOOP
    v_period := (v_period + INTERVAL '1 month')::date;
    v_guard := v_guard + 1;
  END LOOP;

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

-- 2) Push stage: reaching RazorpayX must NOT move the loan balance
CREATE OR REPLACE FUNCTION public.hr_apply_loan_push(p_repayment_id uuid, p_razorpay_input_id text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r public.hr_loan_repayments;
BEGIN
  SELECT * INTO r FROM public.hr_loan_repayments WHERE id = p_repayment_id FOR UPDATE;
  IF r IS NULL OR r.status IN ('pushed','paid') THEN RETURN; END IF;

  UPDATE public.hr_loan_repayments
     SET status = 'pushed',
         razorpay_input_id = COALESCE(p_razorpay_input_id, razorpay_input_id),
         razorpay_pushed_at = now(),
         failure_reason = NULL
   WHERE id = r.id;

  IF public.hr_is_payroll_period_processed(r.period_month) THEN
    PERFORM public.hr_settle_loan_installment(r.id);
  END IF;
END;
$function$;

-- 3) Settlement stage: only here does the outstanding balance move
CREATE OR REPLACE FUNCTION public.hr_settle_loan_installment(p_repayment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r public.hr_loan_repayments;
  l public.hr_loans;
  v_paid numeric; v_outstanding numeric;
BEGIN
  SELECT * INTO r FROM public.hr_loan_repayments WHERE id = p_repayment_id FOR UPDATE;
  IF r IS NULL OR r.status <> 'pushed' THEN RETURN; END IF;
  SELECT * INTO l FROM public.hr_loans WHERE id = r.loan_id FOR UPDATE;
  IF l IS NULL THEN RETURN; END IF;

  SELECT COALESCE(SUM(amount),0) INTO v_paid
    FROM public.hr_loan_repayments
   WHERE loan_id = r.loan_id AND status = 'paid' AND id <> r.id;

  v_outstanding := GREATEST(COALESCE(l.amount,0) - v_paid - r.amount, 0);

  UPDATE public.hr_loan_repayments
     SET status = 'paid',
         balance_after = v_outstanding,
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

-- 4) Legacy entrypoint kept for manual/immediate settlement callers
CREATE OR REPLACE FUNCTION public.hr_apply_loan_repayment(p_repayment_id uuid, p_razorpay_input_id text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.hr_apply_loan_push(p_repayment_id, p_razorpay_input_id);
  PERFORM public.hr_settle_loan_installment(p_repayment_id);
END;
$function$;

-- 5) Period settlement + payroll-lock trigger now covers loans too
CREATE OR REPLACE FUNCTION public.hr_settle_loan_period(p_period date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN SELECT id FROM public.hr_loan_repayments
            WHERE status = 'pushed'
              AND period_month = date_trunc('month', p_period)::date
  LOOP
    PERFORM public.hr_settle_loan_installment(r.id);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$function$;

CREATE OR REPLACE FUNCTION public.hr_trg_settle_deposits_on_payroll_lock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.hr_is_payroll_period_processed(NEW.period_month)
     AND (TG_OP = 'INSERT' OR NOT public.hr_is_payroll_period_processed(OLD.period_month)
          OR OLD.locked_at IS DISTINCT FROM NEW.locked_at
          OR OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM public.hr_settle_deposit_period(NEW.period_month);
    PERFORM public.hr_settle_loan_period(NEW.period_month);
  END IF;
  RETURN NEW;
END;
$function$;

-- Internal-only functions: keep them off the public Data API
REVOKE EXECUTE ON FUNCTION public.hr_settle_loan_installment(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.hr_settle_loan_period(date) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.hr_apply_loan_push(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hr_settle_loan_installment(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.hr_settle_loan_period(date) TO service_role;
GRANT EXECUTE ON FUNCTION public.hr_apply_loan_push(uuid, text) TO service_role;