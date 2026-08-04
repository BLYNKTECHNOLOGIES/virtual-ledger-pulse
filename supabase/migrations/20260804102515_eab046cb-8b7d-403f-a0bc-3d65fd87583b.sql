UPDATE public.hr_razorpay_payslip_records
SET reg_pf_ee = abs(reg_pf_ee), reg_pf_er = abs(reg_pf_er),
    reg_esi_ee = abs(reg_esi_ee), reg_esi_er = abs(reg_esi_er),
    reg_lwf_ee = abs(reg_lwf_ee), reg_lwf_er = abs(reg_lwf_er),
    reg_pt = abs(reg_pt), reg_tds = abs(reg_tds),
    reg_advance_salary = abs(reg_advance_salary), reg_loan_emi = abs(reg_loan_emi)
WHERE COALESCE(reg_pf_ee,0) < 0 OR COALESCE(reg_pf_er,0) < 0
   OR COALESCE(reg_esi_ee,0) < 0 OR COALESCE(reg_esi_er,0) < 0
   OR COALESCE(reg_lwf_ee,0) < 0 OR COALESCE(reg_lwf_er,0) < 0
   OR COALESCE(reg_pt,0) < 0 OR COALESCE(reg_tds,0) < 0
   OR COALESCE(reg_advance_salary,0) < 0 OR COALESCE(reg_loan_emi,0) < 0;

DROP VIEW IF EXISTS public.hr_payslips_v;
CREATE VIEW public.hr_payslips_v AS
SELECT id,
    hr_employee_id AS employee_id,
    period_month,
    COALESCE(reg_gross_salary, gross_earnings) AS gross,
    COALESCE(
        CASE WHEN reg_source_uploaded_at IS NOT NULL THEN
            COALESCE(reg_pf_ee,0) + COALESCE(reg_esi_ee,0) + COALESCE(reg_pt,0)
          + COALESCE(reg_tds,0) + COALESCE(reg_lwf_ee,0)
          + COALESCE(reg_advance_salary,0) + COALESCE(reg_loan_emi,0)
          + COALESCE(reg_pf_er,0) + COALESCE(reg_esi_er,0)
          + GREATEST(-COALESCE(reg_one_time_payments,0), 0)
        ELSE NULL::numeric END, total_deductions) AS total_deductions,
    CASE WHEN reg_source_uploaded_at IS NOT NULL THEN
        COALESCE(reg_pf_ee,0) + COALESCE(reg_esi_ee,0) + COALESCE(reg_pt,0)
      + COALESCE(reg_tds,0) + COALESCE(reg_lwf_ee,0)
      + COALESCE(reg_advance_salary,0) + COALESCE(reg_loan_emi,0)
    ELSE NULL::numeric END AS employee_deductions,
    GREATEST(-COALESCE(reg_one_time_payments,0), 0) AS one_time_recovery,
    COALESCE(reg_net_pay, net_pay) AS net,
    COALESCE(reg_tds, tds_amount) AS tds_amount,
    COALESCE(reg_pf_ee, pf_amount) AS pf_amount,
    COALESCE(reg_esi_ee, esi_amount) AS esi_amount,
    COALESCE(reg_pt, professional_tax) AS professional_tax,
    COALESCE(reg_lwf_ee, 0::numeric) AS lwf_ee,
    COALESCE(reg_lwf_er, 0::numeric) AS lwf_er,
    reg_employer_pf_contr AS employer_pf,
    reg_employer_esi_contr AS employer_esi,
    reg_basic AS basic,
    reg_hra AS hra,
    reg_sa AS special_allowance,
    reg_lta AS lta,
    reg_da AS dearness_allowance,
    reg_overtime AS overtime,
    reg_performance_incentive AS performance_incentive,
    reg_refund_security_deposit AS refund_security_deposit,
    reg_loan_emi AS loan_emi,
    reg_advance_salary AS advance_salary,
    reg_one_time_payments AS one_time_payments,
    reg_working_days AS working_days,
    reg_source_filename AS register_source,
    reg_source_uploaded_at IS NOT NULL AS has_register,
    reg_has_left AS has_left,
    reg_relieving_date AS relieving_date,
    reg_pan,
    reg_pf_uan,
    reg_esi_number,
    reg_bank_acc_no,
    reg_ifsc,
    reg_personal_phone,
    reg_personal_email,
    reg_department,
    reg_designation,
    reg_location,
    reg_pt_location,
    reg_gender,
    reg_dob,
    reg_hire_date,
    pdf_url,
    NULLIF(razorpay_payslip_id, ''::text)::bigint AS razorpay_payslip_id,
    pulled_at,
    CASE WHEN reg_source_uploaded_at IS NOT NULL THEN 'register_csv'::text ELSE 'razorpay'::text END AS source,
    pdf_storage_path
FROM public.hr_razorpay_payslip_records r;

GRANT SELECT ON public.hr_payslips_v TO authenticated;
GRANT ALL ON public.hr_payslips_v TO service_role;