
ALTER TABLE public.hr_razorpay_settings
  ADD COLUMN IF NOT EXISTS push_pilot_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS push_pilot_hr_employee_id uuid,
  ADD COLUMN IF NOT EXISTS bulk_push_unlocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_push_at timestamptz;
