
ALTER TABLE public.hr_salary_revisions
  ADD COLUMN IF NOT EXISTS razorpay_pushed_at    timestamptz,
  ADD COLUMN IF NOT EXISTS razorpay_push_response jsonb,
  ADD COLUMN IF NOT EXISTS razorpay_push_error   text,
  ADD COLUMN IF NOT EXISTS razorpay_verified_at  timestamptz;
