CREATE OR REPLACE VIEW public.hr_payslips_v AS
SELECT id,
    hr_employee_id AS employee_id,
    period_month,
    COALESCE(reg_gross_salary, gross_earnings) AS gross,
    COALESCE(
        CASE
            WHEN reg_source_uploaded_at IS NOT NULL THEN COALESCE(reg_pf_ee, 0::numeric) + COALESCE(reg_esi_ee, 0::numeric) + COALESCE(reg_pt, 0::numeric) + COALESCE(reg_tds, 0::numeric) + COALESCE(reg_lwf_ee, 0::numeric) + COALESCE(reg_advance_salary, 0::numeric) + COALESCE(reg_loan_emi, 0::numeric)
            ELSE NULL::numeric
        END, total_deductions) AS total_deductions,
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
        CASE
            WHEN reg_source_uploaded_at IS NOT NULL THEN 'register_csv'::text
            ELSE 'razorpay'::text
        END AS source,
    pdf_storage_path
   FROM hr_razorpay_payslip_records r;

DROP POLICY IF EXISTS "payslips employee read own" ON storage.objects;
CREATE POLICY "payslips employee read own"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'payslips'
  AND public.hr_ess_current_employee_id() IS NOT NULL
  AND split_part(name, '/', 2) = public.hr_ess_current_employee_id()::text || '.pdf'
);