CREATE OR REPLACE FUNCTION public.hr_apply_statutory_change(p_employee uuid, p_effective_from date, p_pf_enabled boolean, p_pf_wage_basis text, p_vpf_mode text, p_vpf_value numeric, p_esi_enabled boolean, p_pt_enabled boolean, p_uan text, p_esic_number text, p_reason text)
 RETURNS TABLE(profile_id uuid, forward_rows_updated integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_month date := date_trunc('month', COALESCE(p_effective_from, CURRENT_DATE))::date;
  v_id uuid;
  v_fwd integer := 0;
BEGIN
  IF p_employee IS NULL THEN
    RAISE EXCEPTION 'Employee is required';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'A reason is required for every statutory change';
  END IF;
  -- Closed-month guard: cockpit Step 7 (payroll run complete) done
  IF EXISTS (SELECT 1 FROM public.hr_payroll_cockpit_state c
              WHERE c.period_month = v_month AND c.step_no = 7 AND c.status = 'done') THEN
    RAISE EXCEPTION 'Payroll for % is already closed — pick a later effective month', to_char(v_month, 'FMMonth YYYY');
  END IF;

  INSERT INTO public.hr_employee_statutory_profiles AS t (
    hr_employee_id, effective_from, pf_enabled, pf_wage_basis, vpf_mode, vpf_value,
    esi_enabled, pt_enabled, uan, esic_number, reason, source, created_by
  ) VALUES (
    p_employee, v_month, COALESCE(p_pf_enabled, true), COALESCE(p_pf_wage_basis, 'capped'),
    COALESCE(p_vpf_mode, 'none'), COALESCE(p_vpf_value, 0), COALESCE(p_esi_enabled, true),
    COALESCE(p_pt_enabled, false), NULLIF(btrim(COALESCE(p_uan, '')), ''),
    NULLIF(btrim(COALESCE(p_esic_number, '')), ''), btrim(p_reason), 'hrms_profile', auth.uid()
  )
  ON CONFLICT (hr_employee_id, effective_from) DO UPDATE
    SET pf_enabled = EXCLUDED.pf_enabled,
        pf_wage_basis = EXCLUDED.pf_wage_basis,
        vpf_mode = EXCLUDED.vpf_mode,
        vpf_value = EXCLUDED.vpf_value,
        esi_enabled = EXCLUDED.esi_enabled,
        pt_enabled = EXCLUDED.pt_enabled,
        uan = EXCLUDED.uan,
        esic_number = EXCLUDED.esic_number,
        reason = EXCLUDED.reason,
        source = EXCLUDED.source,
        created_by = EXCLUDED.created_by
  RETURNING t.id INTO v_id;

  -- Carry forward: later months inherit this change so it is not shadowed
  UPDATE public.hr_employee_statutory_profiles p
     SET pf_enabled = COALESCE(p_pf_enabled, true),
         pf_wage_basis = COALESCE(p_pf_wage_basis, 'capped'),
         vpf_mode = COALESCE(p_vpf_mode, 'none'),
         vpf_value = COALESCE(p_vpf_value, 0),
         esi_enabled = COALESCE(p_esi_enabled, true),
         pt_enabled = COALESCE(p_pt_enabled, false),
         uan = NULLIF(btrim(COALESCE(p_uan, '')), ''),
         esic_number = NULLIF(btrim(COALESCE(p_esic_number, '')), ''),
         reason = btrim(p_reason) || ' (carried forward)',
         source = 'hrms_profile'
   WHERE p.hr_employee_id = p_employee
     AND p.effective_from > v_month;
  GET DIAGNOSTICS v_fwd = ROW_COUNT;

  RETURN QUERY SELECT v_id, v_fwd;
END;
$function$;

CREATE OR REPLACE VIEW public.hr_payslip_gross_split_v WITH (security_invoker = on) AS
 SELECT r.id AS payslip_record_id,
    r.hr_employee_id,
    r.period_month,
    COALESCE(r.reg_gross_salary, r.gross_earnings, (0)::numeric) AS reported_gross,
    COALESCE(l.one_time_total, (0)::numeric) AS one_time_total,
    COALESCE(l.variable_total, (0)::numeric) AS extra_variable_total,
    ((GREATEST(abs(COALESCE(r.reg_pf_er, (0)::numeric)), abs(COALESCE(r.reg_employer_pf_contr, (0)::numeric))) + GREATEST(abs(COALESCE(r.reg_esi_er, (0)::numeric)), abs(COALESCE(r.reg_employer_esi_contr, (0)::numeric)))) + abs(COALESCE(r.reg_lwf_er, (0)::numeric))) AS employer_contrib,
    GREATEST((((((COALESCE(r.reg_gross_salary, r.gross_earnings, (0)::numeric) - COALESCE(l.one_time_total, (0)::numeric)) - COALESCE(r.reg_overtime, (0)::numeric)) - COALESCE(r.reg_performance_incentive, (0)::numeric)) - COALESCE(l.variable_total, (0)::numeric)) - COALESCE(r.reg_refund_security_deposit, (0)::numeric)), (0)::numeric) AS regular_gross,
    COALESCE(r.reg_net_pay, r.net_pay) AS net_pay
   FROM (hr_razorpay_payslip_records r
     LEFT JOIN ( SELECT hr_payslip_pay_head_lines.payslip_record_id,
            sum(CASE WHEN (hr_payslip_pay_head_lines.classification = 'one_time'::text) THEN hr_payslip_pay_head_lines.amount ELSE (0)::numeric END) AS one_time_total,
            sum(CASE WHEN (hr_payslip_pay_head_lines.classification = 'variable'::text) THEN hr_payslip_pay_head_lines.amount ELSE (0)::numeric END) AS variable_total
           FROM hr_payslip_pay_head_lines
          GROUP BY hr_payslip_pay_head_lines.payslip_record_id) l ON ((l.payslip_record_id = r.id)));