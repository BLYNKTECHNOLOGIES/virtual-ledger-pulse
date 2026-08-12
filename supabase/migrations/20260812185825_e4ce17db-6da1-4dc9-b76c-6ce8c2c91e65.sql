ALTER TABLE public.hr_attendance_notice_log
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_hr_attendance_notice_log_created
  ON public.hr_attendance_notice_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_attendance_notice_log_status
  ON public.hr_attendance_notice_log (status);