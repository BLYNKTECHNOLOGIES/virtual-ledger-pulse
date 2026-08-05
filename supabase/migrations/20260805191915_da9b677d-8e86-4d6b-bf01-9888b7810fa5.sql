REVOKE ALL ON public.hr_payslips_v FROM anon;
REVOKE ALL ON public.hr_payslip_gross_split_v FROM anon;
REVOKE ALL ON public.hr_payslip_pay_head_lines FROM anon;
REVOKE ALL ON public.hr_razorpay_payslip_records FROM anon;
GRANT SELECT ON public.hr_payslips_v TO authenticated;
GRANT ALL ON public.hr_payslips_v TO service_role;