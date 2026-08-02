ALTER TABLE public.hr_employee_deposits DROP CONSTRAINT IF EXISTS hr_employee_deposits_deduction_mode_check;
ALTER TABLE public.hr_employee_deposits ADD CONSTRAINT hr_employee_deposits_deduction_mode_check
  CHECK (deduction_mode = ANY (ARRAY['one_time'::text,'percentage'::text,'percentage_ctc'::text,'fixed_installment'::text,'already_deducted'::text]));

CREATE OR REPLACE FUNCTION public.hr_rebuild_deposit_schedule(p_deposit_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;