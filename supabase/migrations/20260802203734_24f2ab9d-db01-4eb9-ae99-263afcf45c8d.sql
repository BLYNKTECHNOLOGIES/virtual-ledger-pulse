CREATE OR REPLACE FUNCTION public.hr_record_manual_loan_repayment(
  p_loan_id uuid,
  p_amount numeric,
  p_repayment_date date DEFAULT CURRENT_DATE,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  l public.hr_loans;
  v_paid numeric;
  v_id uuid;
  v_period date := date_trunc('month', p_repayment_date)::date;
  v_existing public.hr_loan_repayments;
BEGIN
  SELECT * INTO l FROM public.hr_loans WHERE id = p_loan_id FOR UPDATE;
  IF l IS NULL THEN RAISE EXCEPTION 'Loan not found'; END IF;
  IF COALESCE(p_amount,0) <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;

  SELECT COALESCE(SUM(amount),0) INTO v_paid
    FROM public.hr_loan_repayments WHERE loan_id = p_loan_id AND status = 'paid';

  -- One repayment row per loan + month: settle the existing installment if present.
  SELECT * INTO v_existing
    FROM public.hr_loan_repayments
   WHERE loan_id = p_loan_id AND period_month = v_period
   FOR UPDATE;

  IF v_existing.id IS NOT NULL THEN
    IF v_existing.status = 'paid' THEN
      RAISE EXCEPTION 'A repayment is already recorded for %', to_char(v_period,'Mon YYYY');
    END IF;
    UPDATE public.hr_loan_repayments
       SET amount = p_amount,
           status = 'paid',
           repayment_type = 'manual',
           repayment_date = p_repayment_date,
           balance_after = GREATEST(COALESCE(l.amount,0) - v_paid - p_amount, 0),
           failure_reason = NULL,
           notes = p_notes
     WHERE id = v_existing.id
     RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.hr_loan_repayments
      (loan_id, employee_id, amount, repayment_date, repayment_type, status,
       period_month, balance_after, notes)
    VALUES
      (p_loan_id, l.employee_id, p_amount, p_repayment_date, 'manual', 'paid',
       v_period, GREATEST(COALESCE(l.amount,0) - v_paid - p_amount, 0), p_notes)
    RETURNING id INTO v_id;
  END IF;

  PERFORM public.hr_rebuild_loan_schedule(p_loan_id);
  RETURN v_id;
END;
$function$;