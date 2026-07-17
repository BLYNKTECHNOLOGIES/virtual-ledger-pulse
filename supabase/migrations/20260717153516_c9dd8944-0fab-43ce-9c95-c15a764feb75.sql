
ALTER TABLE public.hr_attendance_daily DROP CONSTRAINT IF EXISTS hr_attendance_daily_status_check;
ALTER TABLE public.hr_attendance_daily
  ADD CONSTRAINT hr_attendance_daily_status_check
  CHECK (status = ANY (ARRAY['present','absent','half_day','late','on_leave','incomplete']));
