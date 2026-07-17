
ALTER TABLE public.hr_attendance_punches DROP CONSTRAINT IF EXISTS uq_punch_emp_time;
ALTER TABLE public.hr_attendance_punches
  ADD CONSTRAINT uq_punch_emp_time_type UNIQUE (employee_id, punch_time, punch_type);

CREATE INDEX IF NOT EXISTS idx_punches_emp_type_time
  ON public.hr_attendance_punches (employee_id, punch_type, punch_time DESC);

COMMENT ON COLUMN public.hr_biometric_devices.device_direction IS
  'Directional role: "In Device" forces punch_type=in for every push; "Out Device" forces punch_type=out; "System Direction(In/Out) Device" (default) derives from raw_status.';
