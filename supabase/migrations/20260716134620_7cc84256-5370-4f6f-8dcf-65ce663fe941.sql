ALTER TABLE public.hr_razorpay_settings
  ADD COLUMN IF NOT EXISTS probe_pilot_employee_id text,
  ADD COLUMN IF NOT EXISTS probe_pilot_contractor_id text;