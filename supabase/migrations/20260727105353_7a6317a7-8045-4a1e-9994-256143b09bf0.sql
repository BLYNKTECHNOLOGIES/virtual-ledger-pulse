
-- 1) New reg_* columns on hr_razorpay_payslip_records
ALTER TABLE public.hr_razorpay_payslip_records
  ADD COLUMN IF NOT EXISTS reg_lwf_ee numeric,
  ADD COLUMN IF NOT EXISTS reg_lwf_er numeric,
  ADD COLUMN IF NOT EXISTS reg_overtime numeric,
  ADD COLUMN IF NOT EXISTS reg_performance_incentive numeric,
  ADD COLUMN IF NOT EXISTS reg_refund_security_deposit numeric,
  ADD COLUMN IF NOT EXISTS reg_has_left boolean,
  ADD COLUMN IF NOT EXISTS reg_relieving_date date,
  ADD COLUMN IF NOT EXISTS reg_pan text,
  ADD COLUMN IF NOT EXISTS reg_pf_uan text,
  ADD COLUMN IF NOT EXISTS reg_esi_number text,
  ADD COLUMN IF NOT EXISTS reg_bank_acc_no text,
  ADD COLUMN IF NOT EXISTS reg_ifsc text,
  ADD COLUMN IF NOT EXISTS reg_personal_phone text,
  ADD COLUMN IF NOT EXISTS reg_personal_email text,
  ADD COLUMN IF NOT EXISTS reg_department text,
  ADD COLUMN IF NOT EXISTS reg_designation text,
  ADD COLUMN IF NOT EXISTS reg_location text,
  ADD COLUMN IF NOT EXISTS reg_pt_location text,
  ADD COLUMN IF NOT EXISTS reg_gender text,
  ADD COLUMN IF NOT EXISTS reg_dob date,
  ADD COLUMN IF NOT EXISTS reg_hire_date date;

-- 2) Rebuild hr_payslips_v to surface the new fields.
--    Prefers register-CSV values (source='register_csv') and falls back to API values (source='razorpay').
DROP VIEW IF EXISTS public.hr_payslips_v;
CREATE VIEW public.hr_payslips_v
WITH (security_invoker = true) AS
SELECT
  r.id,
  r.hr_employee_id                       AS employee_id,
  r.period_month,
  COALESCE(r.reg_gross_salary, r.gross_earnings)                       AS gross,
  COALESCE(
    CASE WHEN r.reg_source_uploaded_at IS NOT NULL THEN
      COALESCE(r.reg_pf_ee,0)+COALESCE(r.reg_esi_ee,0)+COALESCE(r.reg_pt,0)
      +COALESCE(r.reg_tds,0)+COALESCE(r.reg_lwf_ee,0)
      +COALESCE(r.reg_advance_salary,0)+COALESCE(r.reg_loan_emi,0)
    END,
    r.total_deductions
  )                                                                    AS total_deductions,
  COALESCE(r.reg_net_pay, r.net_pay)                                   AS net,
  COALESCE(r.reg_tds, r.tds_amount)                                    AS tds_amount,
  COALESCE(r.reg_pf_ee, r.pf_amount)                                   AS pf_amount,
  COALESCE(r.reg_esi_ee, r.esi_amount)                                 AS esi_amount,
  COALESCE(r.reg_pt, r.professional_tax)                               AS professional_tax,
  COALESCE(r.reg_lwf_ee, 0)                                            AS lwf_ee,
  COALESCE(r.reg_lwf_er, 0)                                            AS lwf_er,
  r.reg_employer_pf_contr                                              AS employer_pf,
  r.reg_employer_esi_contr                                             AS employer_esi,
  r.reg_basic                                                          AS basic,
  r.reg_hra                                                            AS hra,
  r.reg_sa                                                             AS special_allowance,
  r.reg_lta                                                            AS lta,
  r.reg_da                                                             AS dearness_allowance,
  r.reg_overtime                                                       AS overtime,
  r.reg_performance_incentive                                          AS performance_incentive,
  r.reg_refund_security_deposit                                        AS refund_security_deposit,
  r.reg_loan_emi                                                       AS loan_emi,
  r.reg_advance_salary                                                 AS advance_salary,
  r.reg_one_time_payments                                              AS one_time_payments,
  r.reg_working_days                                                   AS working_days,
  r.reg_source_filename                                                AS register_source,
  (r.reg_source_uploaded_at IS NOT NULL)                               AS has_register,
  r.reg_has_left                                                       AS has_left,
  r.reg_relieving_date                                                 AS relieving_date,
  r.reg_pan                                                            AS reg_pan,
  r.reg_pf_uan                                                         AS reg_pf_uan,
  r.reg_esi_number                                                     AS reg_esi_number,
  r.reg_bank_acc_no                                                    AS reg_bank_acc_no,
  r.reg_ifsc                                                           AS reg_ifsc,
  r.reg_personal_phone                                                 AS reg_personal_phone,
  r.reg_personal_email                                                 AS reg_personal_email,
  r.reg_department                                                     AS reg_department,
  r.reg_designation                                                    AS reg_designation,
  r.reg_location                                                       AS reg_location,
  r.reg_pt_location                                                    AS reg_pt_location,
  r.reg_gender                                                         AS reg_gender,
  r.reg_dob                                                            AS reg_dob,
  r.reg_hire_date                                                      AS reg_hire_date,
  r.pdf_url,
  NULLIF(r.razorpay_payslip_id,'')::bigint                             AS razorpay_payslip_id,
  r.pulled_at,
  CASE WHEN r.reg_source_uploaded_at IS NOT NULL THEN 'register_csv' ELSE 'razorpay' END AS source
FROM public.hr_razorpay_payslip_records r;

GRANT SELECT ON public.hr_payslips_v TO authenticated;
GRANT ALL    ON public.hr_payslips_v TO service_role;

COMMENT ON VIEW public.hr_payslips_v IS
  'Canonical payslip reader. Prefers Register-CSV values (LWF/PF/ESI/PT/TDS/component splits + separation + identity snapshots) over the payroll API fields.';
