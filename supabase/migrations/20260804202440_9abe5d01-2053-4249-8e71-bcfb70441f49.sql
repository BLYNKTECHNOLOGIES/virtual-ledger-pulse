CREATE OR REPLACE FUNCTION public.hr_reconcile_one_time_payouts(p_period date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  l record;
  v_rev uuid;
  v_matched int := 0;
  v_reg_only jsonb := '[]'::jsonb;
  v_hrms_only jsonb := '[]'::jsonb;
BEGIN
  FOR l IN
    SELECT pl.id, pl.hr_employee_id, pl.label, pl.normalized_label, pl.amount, pl.period_month
    FROM hr_payslip_pay_head_lines pl
    WHERE pl.period_month = p_period AND pl.classification = 'one_time'
  LOOP
    SELECT r.id INTO v_rev
    FROM hr_salary_revisions r
    WHERE r.employee_id = l.hr_employee_id
      AND coalesce(r.payout_month, date_trunc('month', r.effective_from)::date) = l.period_month
      AND coalesce(r.one_time_amount, 0) > 0
      AND abs(coalesce(r.one_time_amount, 0) - l.amount) < 1
      AND (
        r.pay_head_label IS NULL
        OR hr_normalize_pay_head(r.pay_head_label) = l.normalized_label
        OR hr_normalize_pay_head(r.revision_reason) = l.normalized_label
      )
    ORDER BY (hr_normalize_pay_head(coalesce(r.pay_head_label, r.revision_reason)) = l.normalized_label) DESC,
             r.register_confirmed_at NULLS FIRST
    LIMIT 1;

    IF v_rev IS NOT NULL THEN
      UPDATE hr_salary_revisions
      SET register_confirmed_at = now(),
          register_match_note = 'Matched register pay head "' || l.label || '"',
          pay_head_label = coalesce(pay_head_label, l.label),
          updated_at = now()
      WHERE id = v_rev;
      v_matched := v_matched + 1;
    ELSE
      v_reg_only := v_reg_only || jsonb_build_object(
        'line_id', l.id, 'hr_employee_id', l.hr_employee_id,
        'label', l.label, 'amount', l.amount, 'period_month', l.period_month);
    END IF;
    v_rev := NULL;
  END LOOP;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'revision_id', r.id, 'hr_employee_id', r.employee_id,
           'label', coalesce(r.pay_head_label, r.revision_reason, r.revision_type),
           'amount', r.one_time_amount)), '[]'::jsonb)
  INTO v_hrms_only
  FROM hr_salary_revisions r
  WHERE coalesce(r.payout_month, date_trunc('month', r.effective_from)::date) = p_period
    AND coalesce(r.one_time_amount, 0) > 0
    AND r.payout_channel = 'outside_payroll'
    AND r.register_confirmed_at IS NULL;

  RETURN jsonb_build_object(
    'period_month', p_period,
    'matched', v_matched,
    'register_only', v_reg_only,
    'hrms_only', v_hrms_only);
END;
$$;

CREATE OR REPLACE FUNCTION public.hr_backfill_one_time_payout_from_register(p_line_id uuid, p_approved_by text DEFAULT 'Register backfill')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l record; v_id uuid;
BEGIN
  SELECT * INTO l FROM hr_payslip_pay_head_lines WHERE id = p_line_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pay head line not found'; END IF;
  IF l.hr_employee_id IS NULL THEN RAISE EXCEPTION 'Pay head line is not linked to an employee'; END IF;

  INSERT INTO hr_salary_revisions (
    employee_id, revision_type, one_time_amount, payout_month, effective_from,
    payout_paid_on, payout_channel, revision_reason, pay_head_label, is_taxable,
    approved_by, status, register_confirmed_at, register_match_note, notes)
  VALUES (
    l.hr_employee_id, 'one_time_correction', l.amount, l.period_month, l.period_month,
    l.period_month, 'outside_payroll', l.label, l.label, l.is_taxable,
    p_approved_by, 'APPLIED', now(),
    'Backfilled from the ' || to_char(l.period_month, 'Mon YYYY') || ' salary register',
    'Recorded on RazorpayX only; created in HRMS from the salary register import.')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hr_reconcile_one_time_payouts(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_backfill_one_time_payout_from_register(uuid, text) TO authenticated, service_role;