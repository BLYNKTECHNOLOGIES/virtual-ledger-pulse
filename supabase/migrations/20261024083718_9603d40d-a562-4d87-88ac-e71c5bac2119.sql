CREATE OR REPLACE FUNCTION public.hr_reschedule_loan(p_loan_id uuid, p_new_emi numeric, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  l public.hr_loans;
  v_collected numeric;
  v_remaining numeric;
  v_locked int;
  v_created int;
  v_old numeric;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.hr_is_hr_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Only HR can change a loan schedule';
  END IF;
  SELECT * INTO l FROM public.hr_loans WHERE id = p_loan_id FOR UPDATE;
  IF l IS NULL THEN RAISE EXCEPTION 'Loan not found'; END IF;
  IF l.status NOT IN ('approved','active','paused') THEN
    RAISE EXCEPTION 'Only a running loan can be rescheduled (status is %)', l.status;
  END IF;
  IF COALESCE(p_new_emi,0) <= 0 THEN RAISE EXCEPTION 'EMI must be greater than zero'; END IF;

  -- Collected = recovered or already sent to payroll; these rows are never changed.
  SELECT COALESCE(SUM(amount),0) INTO v_collected FROM public.hr_loan_repayments
   WHERE loan_id = p_loan_id AND status IN ('paid','pushed');
  v_remaining := COALESCE(l.amount,0) - v_collected;
  IF v_remaining <= 0 THEN RAISE EXCEPTION 'Nothing left to recover on this loan'; END IF;
  IF p_new_emi > v_remaining THEN
    RAISE EXCEPTION 'EMI cannot exceed the remaining balance of %', round(v_remaining,2);
  END IF;

  v_old := l.emi_amount;
  UPDATE public.hr_loans
     SET emi_amount = round(p_new_emi,2),
         notes = btrim(COALESCE(notes,'') || E'\n' || to_char(now() AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD') ||
                 ' EMI changed ' || round(v_old,2) || ' → ' || round(p_new_emi,2) || COALESCE(': ' || p_reason, '')),
         updated_at = now()
   WHERE id = p_loan_id;

  -- Paused loans keep no future rows; the new EMI applies on resume.
  IF l.status = 'paused' THEN
    v_created := 0;
  ELSE
    v_created := public.hr_rebuild_loan_schedule(p_loan_id);
  END IF;

  SELECT count(*) INTO v_locked FROM public.hr_loan_repayments
   WHERE loan_id = p_loan_id AND status IN ('paid','pushed','skipped');
  UPDATE public.hr_loans SET tenure_months = GREATEST(1, v_locked + v_created) WHERE id = p_loan_id AND l.status <> 'paused';

  RETURN jsonb_build_object('collected', v_collected, 'remaining', v_remaining, 'new_installments', v_created);
END;
$function$;

REVOKE ALL ON FUNCTION public.hr_reschedule_loan(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_reschedule_loan(uuid, numeric, text) TO authenticated, service_role;