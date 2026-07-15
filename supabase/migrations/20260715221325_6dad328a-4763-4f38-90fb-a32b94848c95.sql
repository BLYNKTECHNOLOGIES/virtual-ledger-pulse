
ALTER TABLE public.hr_razorpay_settings
  ADD COLUMN IF NOT EXISTS push_attendance_endpoint_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS push_attendance_envelope_key text,
  ADD COLUMN IF NOT EXISTS push_attendance_envelope_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS push_attendance_envelope_verified_by uuid,
  ADD COLUMN IF NOT EXISTS push_attendance_pilot_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS push_attendance_pilot_hr_employee_id uuid,
  ADD COLUMN IF NOT EXISTS push_attendance_pilot_period text,
  ADD COLUMN IF NOT EXISTS bulk_attendance_push_unlocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_attendance_push_at timestamptz;
