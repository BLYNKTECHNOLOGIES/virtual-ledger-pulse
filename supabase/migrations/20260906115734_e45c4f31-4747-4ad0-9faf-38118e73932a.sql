
-- 1. Ground truth: the monthly salary RazorpayX actually used for a payroll month.
CREATE OR REPLACE FUNCTION public.hr_razorpay_month_salary(p_employee uuid, p_month date)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT s.sal FROM (
    SELECT (d.push_response->>'salary')::numeric AS sal, d.pushed_at
      FROM public.hr_payroll_input_deductions d
     WHERE d.hr_employee_id = p_employee
       AND date_trunc('month', d.period_month)::date = date_trunc('month', p_month)::date
       AND d.pushed_at IS NOT NULL
       AND d.push_response ? 'salary'
    UNION ALL
    SELECT (a.push_response->>'salary')::numeric, a.pushed_at
      FROM public.hr_payroll_input_additions a
     WHERE a.hr_employee_id = p_employee
       AND date_trunc('month', a.period_month)::date = date_trunc('month', p_month)::date
       AND a.pushed_at IS NOT NULL
       AND a.push_response ? 'salary'
  ) s
  WHERE s.sal IS NOT NULL AND s.sal > 0
  ORDER BY s.pushed_at DESC
  LIMIT 1;
$function$;

GRANT EXECUTE ON FUNCTION public.hr_razorpay_month_salary(uuid, date) TO authenticated, service_role;

-- 2. Liveness must not accept the local HRMS mirror (hr_employees.total_salary)
--    as evidence that RazorpayX holds the new CTC.
CREATE OR REPLACE FUNCTION public.hr_ctc_revision_is_live(p_revision_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.hr_salary_revisions sr
    LEFT JOIN public.hr_razorpay_employee_map em ON em.hr_employee_id = sr.employee_id
    WHERE sr.id = p_revision_id
      AND sr.new_total IS NOT NULL
      AND (
        sr.razorpay_pushed_at IS NOT NULL
        OR sr.razorpay_verified_at IS NOT NULL
        OR round(COALESCE((em.last_pull_snapshot->'__salary'->>'annual_ctc')::numeric, -1))
             = round(sr.new_total)
      )
  );
$function$;

-- 3. The correction itself: direction driven by the salary RazorpayX paid.
CREATE OR REPLACE FUNCTION public.hr_training_ctc_adjustment(p_revision_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_month_start date; v_month_end date; v_n int;
  v_join date; v_exit date; v_ws date; v_we date;
  v_g1 numeric; v_g2 numeric;
  v_t date; v_old_end date; v_d_old int; v_d_new int;
  v_lop_before numeric := 0; v_lop_after numeric := 0;
  v_processed boolean; v_paid numeric; v_mid numeric;
  v_kind text; v_amount numeric; v_period date;
  v_rzp numeric; v_paid_new boolean; v_basis text;
BEGIN
  SELECT sr.id, sr.employee_id, sr.effective_from, sr.previous_total, sr.new_total, sr.revision_reason
    INTO r FROM public.hr_salary_revisions sr WHERE sr.id = p_revision_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'revision not found'); END IF;
  IF COALESCE(r.previous_total,0) = 0 OR r.new_total IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing previous/new CTC');
  END IF;

  v_t := r.effective_from;
  v_month_start := date_trunc('month', v_t)::date;
  v_month_end := (v_month_start + interval '1 month - 1 day')::date;
  v_n := EXTRACT(DAY FROM v_month_end)::int;
  v_g1 := r.previous_total / 12.0;
  v_g2 := r.new_total / 12.0;

  SELECT (SELECT wi.joining_date FROM public.hr_employee_work_info wi
          WHERE wi.employee_id = r.employee_id ORDER BY wi.joining_date NULLS LAST LIMIT 1),
         COALESCE(e.last_working_day, e.termination_date)
    INTO v_join, v_exit
  FROM public.hr_employees e WHERE e.id = r.employee_id;

  v_ws := GREATEST(v_month_start, COALESCE(v_join, v_month_start));
  v_we := LEAST(v_month_end, COALESCE(v_exit, v_month_end));

  IF v_t < v_ws OR v_t > v_we THEN
    RETURN jsonb_build_object('ok', true, 'amount', 0, 'kind', 'none',
      'reason', 'effective date outside the employment window for this month');
  END IF;

  v_old_end := LEAST(v_t - 1, v_we);
  v_d_old := GREATEST(0, (v_old_end - v_ws) + 1);
  v_d_new := GREATEST(0, (v_we - GREATEST(v_t, v_ws)) + 1);

  -- LOP days are reported for transparency only. They are NOT netted off the
  -- correction: the LOP deduction is itself computed on the day-weighted
  -- (blended) monthly base, so subtracting them here would double-count.
  IF v_d_old > 0 THEN
    SELECT COALESCE(SUM(l.lop_days),0) INTO v_lop_before
    FROM public.hr_lop_days_window(ARRAY[r.employee_id]::uuid[], v_month_start, v_ws, v_old_end) l;
  END IF;
  IF v_d_new > 0 THEN
    SELECT COALESCE(SUM(l.lop_days),0) INTO v_lop_after
    FROM public.hr_lop_days_window(ARRAY[r.employee_id]::uuid[], v_month_start, GREATEST(v_t, v_ws), v_we) l;
  END IF;

  SELECT ps.gross_salary INTO v_paid
  FROM public.hr_payslips ps
  WHERE ps.employee_id = r.employee_id
    AND date_trunc('month', ps.period_month)::date = v_month_start
  ORDER BY ps.created_at DESC NULLS LAST
  LIMIT 1;
  v_processed := v_paid IS NOT NULL;
  v_mid := (v_g1 + v_g2) / 2.0;

  -- Which rate is RazorpayX actually paying this month?
  v_rzp := public.hr_razorpay_month_salary(r.employee_id, v_month_start);
  IF v_rzp IS NOT NULL THEN
    v_paid_new := (v_g2 > v_g1 AND v_rzp >= v_mid) OR (v_g2 < v_g1 AND v_rzp <= v_mid);
    v_basis := 'razorpay_month_salary';
  ELSIF v_paid IS NOT NULL THEN
    v_paid_new := (v_g2 > v_g1 AND v_paid >= v_mid) OR (v_g2 < v_g1 AND v_paid <= v_mid);
    v_basis := 'payslip_gross';
  ELSE
    v_paid_new := public.hr_ctc_revision_is_live(p_revision_id);
    v_basis := 'ctc_liveness';
  END IF;

  IF v_paid_new THEN
    IF v_processed THEN
      RETURN jsonb_build_object('ok', true, 'amount', 0, 'kind', 'none',
        'revision_id', r.id, 'employee_id', r.employee_id, 'basis', v_basis,
        'reason', format('%s was already paid at the new CTC and the month is closed — no correction staged',
                         to_char(v_month_start,'Mon YYYY')));
    END IF;
    -- Whole month will be paid at the new rate: recover the pre-effective part.
    v_amount := -(v_g2 - v_g1) * v_d_old / v_n;
    v_period := v_month_start;
  ELSE
    -- Month is being paid at the OLD rate: owe the post-effective part.
    v_amount := (v_g2 - v_g1) * v_d_new / v_n;
    v_period := CASE WHEN v_processed THEN (v_month_start + interval '1 month')::date ELSE v_month_start END;
  END IF;

  v_amount := round(v_amount);
  v_kind := CASE WHEN v_amount >= 0 THEN 'addition' ELSE 'deduction' END;
  IF abs(v_amount) < 10 THEN v_kind := 'none'; END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'revision_id', r.id,
    'employee_id', r.employee_id,
    'kind', v_kind,
    'amount', abs(v_amount),
    'signed_amount', v_amount,
    'period_month', v_period,
    'basis', v_basis,
    'mode', CASE WHEN v_paid_new THEN 'recovery' ELSE 'arrears' END,
    'derivation', jsonb_build_object(
      'old_ctc', r.previous_total, 'new_ctc', r.new_total,
      'monthly_old', round(v_g1, 2), 'monthly_new', round(v_g2, 2),
      'effective_from', v_t, 'calendar_days', v_n,
      'window_start', v_ws, 'window_end', v_we,
      'days_before', v_d_old, 'days_after', v_d_new,
      'lop_before', v_lop_before, 'lop_after', v_lop_after,
      'razorpay_month_salary', v_rzp,
      'paid_gross', CASE WHEN v_paid IS NULL THEN NULL ELSE round(v_paid,2) END,
      'paid_at_new_rate', v_paid_new,
      'lop_netted_off', false,
      'divisor', v_n
    )
  );
END;
$function$;
