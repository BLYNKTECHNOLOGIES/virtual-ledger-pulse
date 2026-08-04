CREATE OR REPLACE FUNCTION public.hr_normalize_pay_head(p_label text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT lower(regexp_replace(coalesce(p_label,''), '[^a-zA-Z0-9]+', ' ', 'g'))
$$;

CREATE OR REPLACE FUNCTION public.hr_sync_pay_head_lines(p_period date DEFAULT NULL)
RETURNS TABLE(records_scanned integer, lines_upserted integer, heads_touched integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  e jsonb;
  v_label text;
  v_norm text;
  v_amt numeric;
  v_class text;
  v_taxable boolean;
  v_head uuid;
  v_offset numeric;
  v_variable_total numeric;
  v_rest_total numeric;
  n_rec int := 0; n_line int := 0; n_head int := 0;
BEGIN
  FOR r IN
    SELECT id, hr_employee_id, period_month, reg_extra_earnings, reg_one_time_payments
    FROM hr_razorpay_payslip_records
    WHERE reg_source_uploaded_at IS NOT NULL
      AND jsonb_typeof(reg_extra_earnings) = 'array'
      AND jsonb_array_length(reg_extra_earnings) > 0
      AND (p_period IS NULL OR period_month = p_period)
  LOOP
    n_rec := n_rec + 1;
    v_offset := abs(coalesce(r.reg_one_time_payments, 0));

    SELECT
      coalesce(sum(CASE WHEN hr_normalize_pay_head(x->>'label') ~ '(bonus|incentive|commission|overtime|arrear)' THEN (x->>'amount')::numeric ELSE 0 END), 0),
      coalesce(sum(CASE WHEN hr_normalize_pay_head(x->>'label') ~ '(bonus|incentive|commission|overtime|arrear)' THEN 0 ELSE (x->>'amount')::numeric END), 0)
    INTO v_variable_total, v_rest_total
    FROM jsonb_array_elements(r.reg_extra_earnings) x;

    FOR e IN SELECT * FROM jsonb_array_elements(r.reg_extra_earnings)
    LOOP
      v_label := coalesce(e->>'label','');
      IF v_label = '' THEN CONTINUE; END IF;
      v_norm := hr_normalize_pay_head(v_label);
      v_amt := coalesce((e->>'amount')::numeric, 0);

      IF v_norm ~ '(bonus|incentive|commission|overtime|arrear)' THEN
        v_class := 'variable'; v_taxable := true;
      ELSIF v_offset > 0 AND abs(v_rest_total - v_offset) < 0.5 THEN
        v_class := 'one_time'; v_taxable := false;
      ELSE
        v_class := 'unclassified'; v_taxable := true;
      END IF;

      INSERT INTO hr_pay_heads (label, normalized_label, classification, is_taxable, needs_review, first_seen_month, last_seen_month, occurrences)
      VALUES (v_label, v_norm, v_class, v_taxable, v_class = 'unclassified', r.period_month, r.period_month, 1)
      ON CONFLICT (normalized_label) DO UPDATE SET
        last_seen_month = GREATEST(hr_pay_heads.last_seen_month, EXCLUDED.last_seen_month),
        first_seen_month = LEAST(hr_pay_heads.first_seen_month, EXCLUDED.first_seen_month),
        occurrences = hr_pay_heads.occurrences + 1,
        updated_at = now()
      RETURNING id, classification, is_taxable INTO v_head, v_class, v_taxable;

      n_head := n_head + 1;

      INSERT INTO hr_payslip_pay_head_lines (payslip_record_id, hr_employee_id, period_month, pay_head_id, label, normalized_label, amount, classification, is_taxable)
      VALUES (r.id, r.hr_employee_id, r.period_month, v_head, v_label, v_norm, v_amt, v_class, v_taxable)
      ON CONFLICT (payslip_record_id, normalized_label) DO UPDATE SET
        amount = EXCLUDED.amount,
        pay_head_id = EXCLUDED.pay_head_id,
        label = EXCLUDED.label,
        classification = EXCLUDED.classification,
        is_taxable = EXCLUDED.is_taxable,
        hr_employee_id = EXCLUDED.hr_employee_id,
        updated_at = now();
      n_line := n_line + 1;
    END LOOP;
  END LOOP;

  RETURN QUERY SELECT n_rec, n_line, n_head;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hr_sync_pay_head_lines(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_normalize_pay_head(text) TO authenticated, service_role;

CREATE OR REPLACE VIEW public.hr_payslip_gross_split_v AS
SELECT
  r.id AS payslip_record_id,
  r.hr_employee_id,
  r.period_month,
  coalesce(r.reg_gross_salary, r.gross_earnings, 0) AS reported_gross,
  coalesce(l.one_time_total, 0) AS one_time_total,
  coalesce(l.variable_total, 0) AS extra_variable_total,
  (GREATEST(abs(coalesce(r.reg_pf_er,0)), abs(coalesce(r.reg_employer_pf_contr,0)))
    + GREATEST(abs(coalesce(r.reg_esi_er,0)), abs(coalesce(r.reg_esi_er,0)))
    + abs(coalesce(r.reg_lwf_er,0))) AS employer_contrib,
  GREATEST(
    coalesce(r.reg_gross_salary, r.gross_earnings, 0)
      - coalesce(l.one_time_total, 0)
      - coalesce(r.reg_overtime, 0)
      - coalesce(r.reg_performance_incentive, 0)
      - coalesce(l.variable_total, 0)
      - coalesce(r.reg_refund_security_deposit, 0),
    0) AS regular_gross,
  coalesce(r.reg_net_pay, r.net_pay) AS net_pay
FROM hr_razorpay_payslip_records r
LEFT JOIN (
  SELECT payslip_record_id,
         sum(CASE WHEN classification = 'one_time' THEN amount ELSE 0 END) AS one_time_total,
         sum(CASE WHEN classification = 'variable' THEN amount ELSE 0 END) AS variable_total
  FROM hr_payslip_pay_head_lines GROUP BY payslip_record_id
) l ON l.payslip_record_id = r.id;

GRANT SELECT ON public.hr_payslip_gross_split_v TO authenticated, service_role;

SELECT * FROM public.hr_sync_pay_head_lines(NULL);