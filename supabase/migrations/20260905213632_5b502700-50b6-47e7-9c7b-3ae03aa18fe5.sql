CREATE OR REPLACE FUNCTION public.hr_revert_loan_push(p_repayment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE r public.hr_loan_repayments;
BEGIN
  SELECT * INTO r FROM public.hr_loan_repayments WHERE id = p_repayment_id FOR UPDATE;
  IF r IS NULL THEN RETURN; END IF;
  IF r.status = 'paid' THEN
    RAISE EXCEPTION 'This loan installment is already recovered and settled — it cannot be pulled back.';
  END IF;
  IF r.status <> 'pushed' THEN RETURN; END IF;

  UPDATE public.hr_loan_repayments
     SET status = 'scheduled',
         razorpay_input_id = NULL,
         razorpay_pushed_at = NULL
   WHERE id = r.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.hr_revert_deposit_collection(p_schedule_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE s public.hr_employee_deposit_schedule;
BEGIN
  SELECT * INTO s FROM public.hr_employee_deposit_schedule WHERE id = p_schedule_id FOR UPDATE;
  IF s IS NULL THEN RETURN; END IF;
  IF s.status = 'collected' THEN
    RAISE EXCEPTION 'This deposit installment is already collected and settled — it cannot be pulled back.';
  END IF;
  IF s.status <> 'pushed' THEN RETURN; END IF;

  UPDATE public.hr_employee_deposit_schedule
     SET status = 'scheduled',
         razorpay_input_id = NULL,
         razorpay_pushed_at = NULL,
         updated_at = now()
   WHERE id = s.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.hr_revert_loan_push(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_revert_deposit_collection(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hr_revert_loan_push(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_revert_deposit_collection(uuid) TO authenticated, service_role;