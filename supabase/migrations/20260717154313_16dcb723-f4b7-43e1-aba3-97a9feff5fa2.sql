
ALTER TABLE public.hr_fnf_settlements
  ADD COLUMN IF NOT EXISTS breakdown jsonb;

COMMENT ON COLUMN public.hr_fnf_settlements.breakdown IS
'Show-the-working line-by-line arithmetic for each F&F component. Rendered read-only in the UI so HR can verify every figure.';

CREATE OR REPLACE FUNCTION public.hr_compute_fnf_breakdown(
  p_employee_id uuid,
  p_last_working_day date,
  p_notice_days_served int DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ctc numeric := 0;
  v_monthly_gross numeric := 0;
  v_per_day_rate numeric := 0;
  v_days_in_month int;
  v_worked_days int;
  v_pending_salary numeric := 0;
  v_leave_balance numeric := 0;
  v_leave_encash numeric := 0;
  v_notice_days_required int := 30;
  v_notice_shortfall int := 0;
  v_notice_recovery numeric := 0;
  v_loan_outstanding numeric := 0;
  v_deposit_refund numeric := 0;
  v_penalties numeric := 0;
  v_gross_payable numeric := 0;
  v_net_payable numeric := 0;
BEGIN
  -- 1) Base pay: latest salary structure
  SELECT COALESCE(monthly_ctc, 0)
    INTO v_ctc
    FROM public.hr_employee_salary_structures
   WHERE employee_id = p_employee_id
   ORDER BY effective_date DESC NULLS LAST
   LIMIT 1;

  v_monthly_gross := COALESCE(v_ctc, 0);
  v_days_in_month := EXTRACT(DAY FROM (date_trunc('month', p_last_working_day) + INTERVAL '1 month - 1 day'));
  v_per_day_rate := CASE WHEN v_days_in_month > 0 THEN v_monthly_gross / v_days_in_month ELSE 0 END;
  v_worked_days := EXTRACT(DAY FROM p_last_working_day);
  v_pending_salary := ROUND(v_per_day_rate * v_worked_days, 2);

  -- 2) Leave encashment: sum of available balance across encashable leave types
  SELECT COALESCE(SUM(la.available_days), 0)
    INTO v_leave_balance
    FROM public.hr_leave_allocations la
    JOIN public.hr_leave_types lt ON lt.id = la.leave_type_id
   WHERE la.employee_id = p_employee_id
     AND COALESCE(lt.is_encashable, false) = true;

  v_leave_encash := ROUND(v_leave_balance * v_per_day_rate, 2);

  -- 3) Notice-period recovery
  v_notice_shortfall := GREATEST(v_notice_days_required - COALESCE(p_notice_days_served, 0), 0);
  v_notice_recovery := ROUND(v_notice_shortfall * v_per_day_rate, 2);

  -- 4) Loan outstanding
  SELECT COALESCE(SUM(outstanding_amount), 0)
    INTO v_loan_outstanding
    FROM public.hr_loans
   WHERE employee_id = p_employee_id
     AND COALESCE(outstanding_amount, 0) > 0;

  -- 5) Refundable deposits
  SELECT COALESCE(SUM(remaining_amount), 0)
    INTO v_deposit_refund
    FROM public.hr_employee_deposits
   WHERE employee_id = p_employee_id
     AND COALESCE(remaining_amount, 0) > 0;

  -- 6) Pending penalties (unpaid)
  SELECT COALESCE(SUM(amount), 0)
    INTO v_penalties
    FROM public.hr_penalties
   WHERE employee_id = p_employee_id
     AND COALESCE(is_paid, false) = false;

  v_gross_payable := v_pending_salary + v_leave_encash + v_deposit_refund;
  v_net_payable := v_gross_payable - v_notice_recovery - v_loan_outstanding - v_penalties;

  RETURN jsonb_build_object(
    'inputs', jsonb_build_object(
      'monthly_ctc', v_monthly_gross,
      'last_working_day', p_last_working_day,
      'days_in_last_month', v_days_in_month,
      'per_day_rate', v_per_day_rate,
      'worked_days_in_last_month', v_worked_days,
      'notice_days_required', v_notice_days_required,
      'notice_days_served', p_notice_days_served
    ),
    'earnings', jsonb_build_object(
      'pending_salary', jsonb_build_object(
         'amount', v_pending_salary,
         'formula', v_per_day_rate::text || ' /day × ' || v_worked_days::text || ' days'),
      'leave_encashment', jsonb_build_object(
         'amount', v_leave_encash,
         'days', v_leave_balance,
         'formula', v_leave_balance::text || ' days × ' || v_per_day_rate::text || ' /day'),
      'deposit_refund', jsonb_build_object(
         'amount', v_deposit_refund,
         'formula', 'Sum of remaining refundable deposits')
    ),
    'deductions', jsonb_build_object(
      'notice_recovery', jsonb_build_object(
         'amount', v_notice_recovery,
         'shortfall_days', v_notice_shortfall,
         'formula', v_notice_shortfall::text || ' shortfall days × ' || v_per_day_rate::text || ' /day'),
      'loan_outstanding', jsonb_build_object(
         'amount', v_loan_outstanding,
         'formula', 'Sum of open loan outstanding amounts'),
      'penalties', jsonb_build_object(
         'amount', v_penalties,
         'formula', 'Sum of unpaid penalty amounts')
    ),
    'totals', jsonb_build_object(
      'gross_payable', v_gross_payable,
      'total_deductions', v_notice_recovery + v_loan_outstanding + v_penalties,
      'net_payable', v_net_payable
    ),
    'note', 'Preview only — commit the F&F to lock these figures. All arithmetic shown above so HR can verify each line.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.hr_compute_fnf_breakdown(uuid, date, int) TO authenticated, service_role;
