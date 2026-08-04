CREATE OR REPLACE VIEW public.hr_payslips_v AS
SELECT r.id,
    r.hr_employee_id AS employee_id,
    r.period_month,
    COALESCE(r.reg_gross_salary, r.gross_earnings) AS gross,
    COALESCE(
        CASE WHEN r.reg_source_uploaded_at IS NOT NULL THEN COALESCE(r.reg_pf_ee,0)+COALESCE(r.reg_esi_ee,0)+COALESCE(r.reg_pt,0)+COALESCE(r.reg_tds,0)+COALESCE(r.reg_lwf_ee,0)+COALESCE(r.reg_advance_salary,0)+COALESCE(r.reg_loan_emi,0)+COALESCE(r.reg_pf_er,0)+COALESCE(r.reg_esi_er,0)+GREATEST(-COALESCE(r.reg_one_time_payments,0),0) ELSE NULL::numeric END,
        r.total_deductions) AS total_deductions,
    CASE WHEN r.reg_source_uploaded_at IS NOT NULL THEN COALESCE(r.reg_pf_ee,0)+COALESCE(r.reg_esi_ee,0)+COALESCE(r.reg_pt,0)+COALESCE(r.reg_tds,0)+COALESCE(r.reg_lwf_ee,0)+COALESCE(r.reg_advance_salary,0)+COALESCE(r.reg_loan_emi,0) ELSE NULL::numeric END AS employee_deductions,
    GREATEST(-COALESCE(r.reg_one_time_payments,0),0) AS one_time_recovery,
    COALESCE(r.reg_net_pay, r.net_pay) AS net,
    COALESCE(r.reg_tds, r.tds_amount) AS tds_amount,
    COALESCE(r.reg_pf_ee, r.pf_amount) AS pf_amount,
    COALESCE(r.reg_esi_ee, r.esi_amount) AS esi_amount,
    COALESCE(r.reg_pt, r.professional_tax) AS professional_tax,
    COALESCE(r.reg_lwf_ee, 0) AS lwf_ee,
    COALESCE(r.reg_lwf_er, 0) AS lwf_er,
    r.reg_employer_pf_contr AS employer_pf,
    r.reg_employer_esi_contr AS employer_esi,
    r.reg_basic AS basic,
    r.reg_hra AS hra,
    r.reg_sa AS special_allowance,
    r.reg_lta AS lta,
    r.reg_da AS dearness_allowance,
    r.reg_overtime AS overtime,
    r.reg_performance_incentive AS performance_incentive,
    r.reg_refund_security_deposit AS refund_security_deposit,
    r.reg_loan_emi AS loan_emi,
    r.reg_advance_salary AS advance_salary,
    r.reg_one_time_payments AS one_time_payments,
    r.reg_working_days AS working_days,
    r.reg_source_filename AS register_source,
    r.reg_source_uploaded_at IS NOT NULL AS has_register,
    r.reg_has_left AS has_left,
    r.reg_relieving_date AS relieving_date,
    r.reg_pan, r.reg_pf_uan, r.reg_esi_number, r.reg_bank_acc_no, r.reg_ifsc,
    r.reg_personal_phone, r.reg_personal_email, r.reg_department, r.reg_designation,
    r.reg_location, r.reg_pt_location, r.reg_gender, r.reg_dob, r.reg_hire_date,
    r.pdf_url,
    NULLIF(r.razorpay_payslip_id, ''::text)::bigint AS razorpay_payslip_id,
    r.pulled_at,
    CASE WHEN r.reg_source_uploaded_at IS NOT NULL THEN 'register_csv'::text ELSE 'razorpay'::text END AS source,
    r.pdf_storage_path,
    -- One-time / variable split (register truth)
    COALESCE(s.regular_gross, COALESCE(r.reg_gross_salary, r.gross_earnings)) AS regular_gross,
    COALESCE(s.one_time_total, 0) AS one_time_total,
    COALESCE(s.extra_variable_total, 0) AS extra_variable_total,
    COALESCE(s.employer_contrib, 0) AS employer_contrib,
    -- Employer PF split for ECR: register merges PF + EDLI/admin into PF(ER)
    LEAST(COALESCE(r.reg_employer_pf_contr, r.reg_pf_er, 0), COALESCE(r.reg_pf_ee, 0)) AS employer_pf_ac1,
    GREATEST(COALESCE(r.reg_employer_pf_contr, r.reg_pf_er, 0) - COALESCE(r.reg_pf_ee, 0), 0) AS employer_pf_edli_admin,
    -- Itemised custom pay heads exactly as they appear on the RazorpayX payslip
    COALESCE(h.lines, '[]'::jsonb) AS pay_head_lines
FROM hr_razorpay_payslip_records r
LEFT JOIN hr_payslip_gross_split_v s ON s.payslip_record_id = r.id
LEFT JOIN (
  SELECT payslip_record_id,
         jsonb_agg(jsonb_build_object('label', label, 'amount', amount, 'classification', classification, 'is_taxable', is_taxable) ORDER BY amount DESC) AS lines
  FROM hr_payslip_pay_head_lines GROUP BY payslip_record_id
) h ON h.payslip_record_id = r.id;

GRANT SELECT ON public.hr_payslips_v TO authenticated, service_role;