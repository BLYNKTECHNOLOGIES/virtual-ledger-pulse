CREATE UNIQUE INDEX IF NOT EXISTS uniq_payslip_email_per_employee_month
ON public.hr_email_send_log ((metadata->>'employee_id'), (metadata->>'period_month'))
WHERE template_name = 'payslip_monthly' AND status = 'sent';