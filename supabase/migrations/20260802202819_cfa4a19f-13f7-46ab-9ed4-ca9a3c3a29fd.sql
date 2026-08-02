-- 1. Unified read-only view of every automatic payroll recovery
CREATE OR REPLACE VIEW public.hr_payroll_auto_recoveries AS
SELECT
  r.id,
  'loan'::text                                   AS source_kind,
  r.loan_id                                      AS parent_id,
  r.employee_id,
  e.badge_id,
  btrim(COALESCE(e.first_name,'') || ' ' || COALESCE(e.last_name,'')) AS employee_name,
  r.period_month,
  r.installment_no,
  r.amount,
  r.status,
  r.razorpay_input_id,
  r.razorpay_pushed_at,
  r.failure_reason,
  CASE WHEN COALESCE(l.loan_type,'') LIKE '%advance%'
       THEN 'Salary advance recovery' ELSE 'Loan EMI' END AS label,
  'LOAN_EMI_M' || r.installment_no                AS razorpay_code
FROM public.hr_loan_repayments r
JOIN public.hr_loans l ON l.id = r.loan_id
LEFT JOIN public.hr_employees e ON e.id = r.employee_id
UNION ALL
SELECT
  s.id,
  'deposit'::text,
  s.deposit_id,
  s.employee_id,
  e.badge_id,
  btrim(COALESCE(e.first_name,'') || ' ' || COALESCE(e.last_name,'')),
  s.period_month,
  s.installment_no,
  s.amount,
  s.status,
  s.razorpay_input_id,
  s.razorpay_pushed_at,
  s.failure_reason,
  CASE WHEN s.deposit_type = 'error_recovery'
       THEN 'Error recovery' ELSE 'Security deposit' END,
  CASE WHEN s.deposit_type = 'error_recovery'
       THEN 'ERROR_RECOVERY_M' ELSE 'SECURITY_DEPOSIT_M' END || s.installment_no
FROM public.hr_employee_deposit_schedule s
LEFT JOIN public.hr_employees e ON e.id = s.employee_id;

GRANT SELECT ON public.hr_payroll_auto_recoveries TO authenticated;
GRANT SELECT ON public.hr_payroll_auto_recoveries TO service_role;

-- 2. Close / foreclose a loan
CREATE OR REPLACE FUNCTION public.hr_close_loan(
  p_loan_id uuid,
  p_mode text DEFAULT 'settled',   -- 'settled' | 'written_off'
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  l public.hr_loans;
BEGIN
  SELECT * INTO l FROM public.hr_loans WHERE id = p_loan_id FOR UPDATE;
  IF l IS NULL THEN RAISE EXCEPTION 'Loan not found'; END IF;
  IF p_mode NOT IN ('settled','written_off') THEN
    RAISE EXCEPTION 'Invalid close mode %', p_mode;
  END IF;

  DELETE FROM public.hr_loan_repayments
   WHERE loan_id = p_loan_id AND status IN ('scheduled','failed');

  UPDATE public.hr_loans
     SET status = 'closed',
         outstanding_balance = 0,
         notes = btrim(COALESCE(notes,'') || E'\n' ||
                 to_char(now(),'YYYY-MM-DD') || ' closed (' || p_mode || ')' ||
                 COALESCE(': ' || p_reason, '')),
         updated_at = now()
   WHERE id = p_loan_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.hr_close_loan(uuid, text, text) TO authenticated;

-- 3. Record a repayment made outside payroll (cash / bank transfer)
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
BEGIN
  SELECT * INTO l FROM public.hr_loans WHERE id = p_loan_id FOR UPDATE;
  IF l IS NULL THEN RAISE EXCEPTION 'Loan not found'; END IF;
  IF COALESCE(p_amount,0) <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;

  SELECT COALESCE(SUM(amount),0) INTO v_paid
    FROM public.hr_loan_repayments WHERE loan_id = p_loan_id AND status = 'paid';

  INSERT INTO public.hr_loan_repayments
    (loan_id, employee_id, amount, repayment_date, repayment_type, status,
     period_month, balance_after, notes)
  VALUES
    (p_loan_id, l.employee_id, p_amount, p_repayment_date, 'manual', 'paid',
     date_trunc('month', p_repayment_date)::date,
     GREATEST(COALESCE(l.amount,0) - v_paid - p_amount, 0), p_notes)
  RETURNING id INTO v_id;

  -- keep future installments aligned with the new remaining balance
  PERFORM public.hr_rebuild_loan_schedule(p_loan_id);
  RETURN v_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.hr_record_manual_loan_repayment(uuid, numeric, date, text) TO authenticated;