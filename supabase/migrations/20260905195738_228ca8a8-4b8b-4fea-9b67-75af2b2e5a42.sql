
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
  v_kind text; v_amount numeric; v_period date; v_note text := NULL;
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

  IF v_d_old > 0 THEN
    SELECT COALESCE(SUM(l.lop_days),0) INTO v_lop_before
    FROM public.hr_lop_days_window(ARRAY[r.employee_id]::uuid[], v_month_start, v_ws, v_old_end) l;
  END IF;
  IF v_d_new > 0 THEN
    SELECT COALESCE(SUM(l.lop_days),0) INTO v_lop_after
    FROM public.hr_lop_days_window(ARRAY[r.employee_id]::uuid[], v_month_start, GREATEST(v_t, v_ws), v_we) l;
  END IF;

  -- Was the transition month already paid out? A payslip alone is NOT proof
  -- that it was paid at the OLD CTC: when the CTC was raised in RazorpayX
  -- before the revision was recorded in HRMS, that payslip already carries the
  -- new rate. Read the amount actually paid and only claim arrears when the
  -- payslip sits on the old side of the two rates.
  SELECT ps.gross_salary INTO v_paid
  FROM public.hr_payslips ps
  WHERE ps.employee_id = r.employee_id
    AND date_trunc('month', ps.period_month)::date = v_month_start
  ORDER BY ps.created_at DESC NULLS LAST
  LIMIT 1;

  v_processed := v_paid IS NOT NULL;
  v_mid := (v_g1 + v_g2) / 2.0;

  IF v_processed AND (
       (v_g2 > v_g1 AND v_paid >= v_mid) OR
       (v_g2 < v_g1 AND v_paid <= v_mid)
     ) THEN
    RETURN jsonb_build_object('ok', true, 'amount', 0, 'kind', 'none',
      'revision_id', r.id, 'employee_id', r.employee_id,
      'reason', format('%s payslip was already paid at the new CTC (gross %s vs old %s / new %s) — no arrears due',
                       to_char(v_month_start,'Mon YYYY'), round(v_paid), round(v_g1), round(v_g2)),
      'derivation', jsonb_build_object(
        'old_ctc', r.previous_total, 'new_ctc', r.new_total,
        'monthly_old', round(v_g1,2), 'monthly_new', round(v_g2,2),
        'effective_from', v_t, 'calendar_days', v_n,
        'paid_gross', round(v_paid,2), 'already_at_new_rate', true));
  END IF;

  IF v_processed THEN
    v_amount := (v_g2 - v_g1) * (GREATEST(0, v_d_new - v_lop_after)) / v_n;
    v_period := (v_month_start + interval '1 month')::date;
    v_kind := CASE WHEN v_amount >= 0 THEN 'addition' ELSE 'deduction' END;
  ELSE
    v_amount := (v_g2 - v_g1) * (GREATEST(0, v_d_old - v_lop_before)) / v_n;
    v_period := v_month_start;
    v_kind := CASE WHEN v_amount >= 0 THEN 'deduction' ELSE 'addition' END;
  END IF;

  v_amount := round(v_amount);
  IF abs(v_amount) < 10 THEN v_kind := 'none'; END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'revision_id', r.id,
    'employee_id', r.employee_id,
    'kind', v_kind,
    'amount', abs(v_amount),
    'signed_amount', v_amount,
    'period_month', v_period,
    'mode', CASE WHEN v_processed THEN 'arrears' ELSE 'recovery' END,
    'derivation', jsonb_build_object(
      'old_ctc', r.previous_total, 'new_ctc', r.new_total,
      'monthly_old', round(v_g1, 2), 'monthly_new', round(v_g2, 2),
      'effective_from', v_t, 'calendar_days', v_n,
      'window_start', v_ws, 'window_end', v_we,
      'days_before', v_d_old, 'days_after', v_d_new,
      'lop_before', v_lop_before, 'lop_after', v_lop_after,
      'paid_days_before', GREATEST(0, v_d_old - v_lop_before),
      'paid_days_after', GREATEST(0, v_d_new - v_lop_after),
      'paid_gross', CASE WHEN v_paid IS NULL THEN NULL ELSE round(v_paid,2) END,
      'divisor', v_n
    )
  );
END;
$function$;
