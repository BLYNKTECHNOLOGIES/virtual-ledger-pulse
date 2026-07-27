-- Rebuild hr_payslips_v to prefer Register-CSV canonical figures over the
-- API's payroll:view-payroll response. The API only returns { salary,
-- deductions } and never emits PF / ESI / PT / TDS component splits — those
-- exist ONLY in the monthly Salary Register CSV. Doctrine (mem: Payroll
-- doctrine) tags register_csv as the sole authority for statutory splits and
-- employer contributions, so the ESS view must surface them.
DROP VIEW IF EXISTS public.hr_payslips_v;
CREATE VIEW public.hr_payslips_v
WITH (security_invoker = on) AS
SELECT
  rpr.id,
  rpr.hr_employee_id                                                    AS employee_id,
  rpr.period_month,
  COALESCE(rpr.reg_gross_salary, rpr.gross_earnings)                    AS gross,
  COALESCE(
    NULLIF(rpr.reg_pf_ee, 0) + NULLIF(rpr.reg_esi_ee, 0) + NULLIF(rpr.reg_pt, 0) + NULLIF(rpr.reg_tds, 0) + NULLIF(rpr.reg_loan_emi, 0) + NULLIF(rpr.reg_advance_salary, 0),
    (COALESCE(rpr.reg_pf_ee,0) + COALESCE(rpr.reg_esi_ee,0) + COALESCE(rpr.reg_pt,0) + COALESCE(rpr.reg_tds,0) + COALESCE(rpr.reg_loan_emi,0) + COALESCE(rpr.reg_advance_salary,0)),
    rpr.total_deductions
  )                                                                     AS total_deductions,
  COALESCE(rpr.reg_net_pay, rpr.net_pay)                                AS net,
  COALESCE(rpr.reg_tds, rpr.tds_amount)                                 AS tds_amount,
  COALESCE(rpr.reg_pf_ee, rpr.pf_amount)                                AS pf_amount,
  COALESCE(rpr.reg_esi_ee, rpr.esi_amount)                              AS esi_amount,
  COALESCE(rpr.reg_pt, rpr.professional_tax)                            AS professional_tax,
  rpr.reg_pf_er                                                         AS employer_pf,
  rpr.reg_esi_er                                                        AS employer_esi,
  rpr.reg_basic                                                         AS basic,
  rpr.reg_hra                                                           AS hra,
  rpr.reg_sa                                                            AS special_allowance,
  rpr.reg_lta                                                           AS lta,
  rpr.reg_da                                                            AS dearness_allowance,
  rpr.reg_loan_emi                                                      AS loan_emi,
  rpr.reg_advance_salary                                                AS advance_salary,
  rpr.reg_one_time_payments                                             AS one_time_payments,
  rpr.reg_working_days                                                  AS working_days,
  rpr.reg_source_filename                                               AS register_source,
  (rpr.reg_gross_salary IS NOT NULL)                                    AS has_register,
  rpr.pdf_url,
  rpr.razorpay_payslip_id,
  rpr.pulled_at,
  rpr.created_at,
  rpr.updated_at,
  CASE WHEN rpr.reg_gross_salary IS NOT NULL THEN 'register_csv'
       ELSE 'razorpay' END                                              AS source
FROM public.hr_razorpay_payslip_records rpr;

GRANT SELECT ON public.hr_payslips_v TO authenticated;
GRANT SELECT ON public.hr_payslips_v TO service_role;