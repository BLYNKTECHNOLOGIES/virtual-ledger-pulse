ALTER TABLE public.hr_shadow_payroll_lines
  ADD COLUMN IF NOT EXISTS razorpay_basis text,
  ADD COLUMN IF NOT EXISTS rz_advance_salary numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rz_loan_emi numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rz_lwf_ee numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rz_refund_security_deposit numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rz_one_time_payments numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rz_overtime numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rz_performance_incentive numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rz_working_days numeric,
  ADD COLUMN IF NOT EXISTS enrollment_mismatch jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS lop_not_pushed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS employment_window jsonb;