
ALTER TABLE public.hr_biometric_devices
  ADD COLUMN IF NOT EXISTS unmatched_pin_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_rejection_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_rejection_pins text;

ALTER TABLE public.hr_biometric_device_users
  ADD COLUMN IF NOT EXISTS normalized_name text
    GENERATED ALWAYS AS (lower(regexp_replace(coalesce(name,''), '[^a-zA-Z0-9]+', '', 'g'))) STORED;

CREATE INDEX IF NOT EXISTS idx_hr_bio_dev_users_normname
  ON public.hr_biometric_device_users(normalized_name)
  WHERE matched_employee_id IS NULL;
