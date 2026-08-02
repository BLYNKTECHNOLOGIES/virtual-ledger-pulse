
-- 1. Is a payroll period already processed (finalised / locked)?
CREATE OR REPLACE FUNCTION public.hr_is_payroll_period_processed(p_period date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.hr_razorpay_payroll_runs
     WHERE period_month = date_trunc('month', p_period)::date
       AND (locked_at IS NOT NULL OR status = 'locked'::public.hr_razorpay_payroll_run_status)
  );
$$;

-- 2. Push no longer collects: mark pushed only.
CREATE OR REPLACE FUNCTION public.hr_apply_deposit_collection(p_schedule_id uuid, p_razorpay_input_id text DEFAULT NULL::text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE s public.hr_employee_deposit_schedule;
BEGIN
  SELECT * INTO s FROM public.hr_employee_deposit_schedule WHERE id = p_schedule_id FOR UPDATE;
  IF s IS NULL OR s.status IN ('pushed','collected') THEN RETURN; END IF;

  UPDATE public.hr_employee_deposit_schedule
     SET status = 'pushed',
         razorpay_input_id = COALESCE(p_razorpay_input_id, razorpay_input_id),
         razorpay_pushed_at = now(),
         failure_reason = NULL,
         updated_at = now()
   WHERE id = s.id;

  -- Balances/ledger are only touched once the payroll month is processed;
  -- if it already is, settle immediately.
  IF public.hr_is_payroll_period_processed(s.period_month) THEN
    PERFORM public.hr_settle_deposit_installment(s.id);
  END IF;
END;
$function$;

-- 3. Settle one pushed installment (payroll processed) -> collected + ledger + balances
CREATE OR REPLACE FUNCTION public.hr_settle_deposit_installment(p_schedule_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
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
    INSERT INTO public.hr_deposit_transactions
      (employee_id, deposit_id, transaction_type, amount, balance_after,
       description, transaction_date, deposit_type, period_month)
    VALUES (d.employee_id, d.id, 'completed', 0, v_balance,
            'Target reached — collection complete', CURRENT_DATE, d.deposit_type, s.period_month);
  END IF;
END;
$function$;

-- 4. Settle every pushed installment of a processed period
CREATE OR REPLACE FUNCTION public.hr_settle_deposit_period(p_period date)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN SELECT id FROM public.hr_employee_deposit_schedule
            WHERE status = 'pushed'
              AND period_month = date_trunc('month', p_period)::date
  LOOP
    PERFORM public.hr_settle_deposit_installment(r.id);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.hr_settle_deposit_period(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_is_payroll_period_processed(date) TO authenticated;

-- 5. Auto-settle when a payroll month gets locked / finalised
CREATE OR REPLACE FUNCTION public.hr_trg_settle_deposits_on_payroll_lock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF public.hr_is_payroll_period_processed(NEW.period_month)
     AND (TG_OP = 'INSERT' OR NOT public.hr_is_payroll_period_processed(OLD.period_month)
          OR OLD.locked_at IS DISTINCT FROM NEW.locked_at
          OR OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM public.hr_settle_deposit_period(NEW.period_month);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_settle_deposits_on_payroll_lock ON public.hr_razorpay_payroll_runs;
CREATE TRIGGER trg_settle_deposits_on_payroll_lock
AFTER INSERT OR UPDATE ON public.hr_razorpay_payroll_runs
FOR EACH ROW EXECUTE FUNCTION public.hr_trg_settle_deposits_on_payroll_lock();

-- 6. Schedule rebuild: allow back-dated start months for unprocessed payroll periods
CREATE OR REPLACE FUNCTION public.hr_rebuild_deposit_schedule(p_deposit_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  d public.hr_employee_deposits;
  v_remaining numeric; v_per numeric; v_monthly numeric;
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

  -- subtract installments already pushed but not yet settled
  SELECT v_remaining - COALESCE(SUM(amount),0) INTO v_remaining
    FROM public.hr_employee_deposit_schedule
   WHERE deposit_id = p_deposit_id AND status = 'pushed';
  IF v_remaining IS NULL OR v_remaining <= 0 THEN RETURN 0; END IF;

  IF d.deduction_mode IN ('percentage','percentage_ctc') THEN
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
  v_start := date_trunc('month', v_start)::date;

  -- A back-dated start month is honoured while that month's payroll is still
  -- open; skip forward over months whose payroll has already been processed.
  WHILE v_start < date_trunc('month', CURRENT_DATE)::date
        AND public.hr_is_payroll_period_processed(v_start)
        AND v_guard < 60 LOOP
    v_start := (v_start + INTERVAL '1 month')::date;
    v_guard := v_guard + 1;
  END LOOP;

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
