ALTER TABLE public.hr_employee_onboarding
  ADD COLUMN IF NOT EXISTS razorpay_employee_id text,
  ADD COLUMN IF NOT EXISTS razorpay_verified_at timestamptz;