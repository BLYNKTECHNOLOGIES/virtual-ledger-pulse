ALTER TABLE public.hr_razorpay_payslip_records
  ADD COLUMN IF NOT EXISTS reg_extra_earnings jsonb,
  ADD COLUMN IF NOT EXISTS reg_official_email text;